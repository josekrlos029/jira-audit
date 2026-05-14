import "server-only";
import type {
  JiraIssue,
  JiraSprintRef,
  QaCompletionStats,
  SprintFetchResult,
} from "./types";
import type { RawChangelogHistory, StatusTransition } from "./qa-metrics";
import { extractStatusTransitions } from "./qa-metrics";

// =============================================================
// Jira "service" client — para usos sin sesión de usuario.
// =============================================================
// Usa Basic auth con un Atlassian API token (no OAuth 3LO).
// Útil para crons / Vercel Cron / scripts que tienen que leer
// el sprint sin tener cookie de sesión.
//
// Cómo conseguir el API token:
//   https://id.atlassian.com/manage-profile/security/api-tokens
//   -> Create API token  -> copiar valor (sólo se ve una vez)
//
// Vars de entorno requeridas:
//   JIRA_USER_EMAIL   — tu email Atlassian (ej. jose.jimenez@tuarmi.com)
//   JIRA_API_TOKEN    — el token generado arriba
//
// Nota: el alcance del API token es TODO lo que vea ese usuario.
// Para producción "real" lo ideal sería una cuenta de servicio,
// pero para este dashboard interno tu cuenta sirve.

const FIELDS = [
  "summary",
  "status",
  "issuetype",
  "priority",
  "assignee",
  "updated",
  "labels",
  "-description",
  "-comment",
  "-attachment",
];

function basicAuthHeader(email: string, token: string): string {
  const raw = `${email}:${token}`;
  // Buffer está disponible en Node runtime (no edge).
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export interface ServiceConfig {
  site: string; // https://farmatodovirtual.atlassian.net
  email: string;
  token: string;
  projectKey: string;
}

export function getServiceConfigFromEnv(): ServiceConfig {
  const site = (
    process.env.NEXT_PUBLIC_JIRA_SITE ?? "https://farmatodovirtual.atlassian.net"
  ).replace(/\/$/, "");
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.NEXT_PUBLIC_JIRA_PROJECT_KEY ?? "ADR";
  if (!email || !token) {
    throw new Error(
      "Faltan JIRA_USER_EMAIL y/o JIRA_API_TOKEN. Crea un API token en " +
        "https://id.atlassian.com/manage-profile/security/api-tokens y agrégalos a .env.local.",
    );
  }
  return { site, email, token, projectKey };
}

/**
 * Trae los issues del/los sprint(s) activo(s) usando Basic auth.
 * Pega directo contra `https://<site>/rest/api/3/search/jql` (no api.atlassian.com).
 */
export async function fetchSprintWithServiceAuth(
  cfg?: Partial<ServiceConfig>,
): Promise<SprintFetchResult> {
  const merged = { ...getServiceConfigFromEnv(), ...cfg };
  const { site, email, token, projectKey } = merged;

  const jql = `project = ${projectKey} AND sprint in openSprints()`;
  const auth = basicAuthHeader(email, token);
  const all: JiraIssue[] = [];

  let nextPageToken: string | undefined;
  let safety = 0;

  do {
    const url = new URL(`${site}/rest/api/3/search/jql`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("fields", FIELDS.join(","));
    url.searchParams.set("maxResults", "100");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);

    const r = await fetch(url.toString(), {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });

    if (!r.ok) {
      const body = await r.text();
      throw new Error(
        `Jira search (service) falló: ${r.status} ${body.slice(0, 300)}`,
      );
    }

    const data = (await r.json()) as {
      issues: JiraIssue[];
      nextPageToken?: string;
      isLast?: boolean;
    };

    for (const it of data.issues ?? []) {
      it.webUrl = `${site}/browse/${it.key}`;
      all.push(it);
    }

    nextPageToken = data.isLast === false ? data.nextPageToken : undefined;
    safety++;
  } while (nextPageToken && safety < 20);

  return {
    issues: all,
    site,
    projectKey,
    fetchedAt: new Date().toISOString(),
  };
}

// =============================================================
// Agile / sprints / changelog helpers (vista QA).
// =============================================================

let _boardIdCache: { projectKey: string; boardId: number } | null = null;

export async function fetchBoardId(cfg?: Partial<ServiceConfig>): Promise<number> {
  const merged = { ...getServiceConfigFromEnv(), ...cfg };
  if (_boardIdCache && _boardIdCache.projectKey === merged.projectKey) {
    return _boardIdCache.boardId;
  }
  const { site, email, token, projectKey } = merged;
  const auth = basicAuthHeader(email, token);
  const url = new URL(`${site}/rest/agile/1.0/board`);
  url.searchParams.set("projectKeyOrId", projectKey);

  const r = await fetch(url.toString(), {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Jira board lookup falló: ${r.status} ${body.slice(0, 300)}`);
  }
  const data = (await r.json()) as {
    values?: Array<{ id: number; name: string; type?: string }>;
  };
  const boards = data.values ?? [];
  if (boards.length === 0) {
    throw new Error(`No se encontró ningún board para el proyecto ${projectKey}`);
  }
  const board =
    boards.find((b) => b.type === "scrum") ??
    boards.find((b) => b.type === "kanban") ??
    boards[0];
  _boardIdCache = { projectKey, boardId: board.id };
  return board.id;
}

export async function fetchRecentSprints(
  cfg?: Partial<ServiceConfig>,
  boardIdOverride?: number,
): Promise<JiraSprintRef[]> {
  const merged = { ...getServiceConfigFromEnv(), ...cfg };
  const boardId = boardIdOverride ?? (await fetchBoardId(merged));
  const { site, email, token } = merged;
  const auth = basicAuthHeader(email, token);

  const all: JiraSprintRef[] = [];
  let startAt = 0;
  let safety = 0;
  while (safety < 20) {
    const url = new URL(`${site}/rest/agile/1.0/board/${boardId}/sprint`);
    url.searchParams.set("state", "active,closed");
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", "50");
    const r = await fetch(url.toString(), {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Jira sprints falló: ${r.status} ${body.slice(0, 300)}`);
    }
    const data = (await r.json()) as {
      values?: JiraSprintRef[];
      isLast?: boolean;
      maxResults?: number;
    };
    for (const sp of data.values ?? []) all.push(sp);
    if (data.isLast || !data.values || data.values.length === 0) break;
    startAt += data.values.length;
    safety++;
  }

  const active = all.filter((s) => s.state === "active");
  const closed = all
    .filter((s) => s.state === "closed")
    .sort((a, b) => {
      const ad = new Date(a.completeDate ?? a.endDate ?? 0).getTime();
      const bd = new Date(b.completeDate ?? b.endDate ?? 0).getTime();
      return bd - ad;
    });
  const result = [...active, ...closed.slice(0, Math.max(0, 3 - active.length))];
  return result.slice(0, 3);
}

interface RawIssueWithCreated {
  id: string;
  key: string;
  fields: JiraIssue["fields"] & { created: string };
}

export interface QaIssueRaw extends JiraIssue {
  sprintId: number;
  sprintName: string;
  createdAt: string;
}

export async function fetchQaIssuesWithChangelog(
  sprints: JiraSprintRef[],
  cfg?: Partial<ServiceConfig>,
): Promise<{ issues: QaIssueRaw[]; changelogs: Map<string, StatusTransition[]> }> {
  const merged = { ...getServiceConfigFromEnv(), ...cfg };
  const { site, email, token, projectKey } = merged;
  const auth = basicAuthHeader(email, token);
  if (sprints.length === 0) return { issues: [], changelogs: new Map() };

  const fields = [
    "summary",
    "status",
    "issuetype",
    "priority",
    "assignee",
    "updated",
    "labels",
    "created",
  ];

  const enriched: QaIssueRaw[] = [];
  const seen = new Set<string>();

  for (const sp of sprints) {
    const jql = `project = ${projectKey} AND sprint = ${sp.id} AND labels = "QA"`;
    let nextPageToken: string | undefined;
    let safety = 0;
    do {
      const url = new URL(`${site}/rest/api/3/search/jql`);
      url.searchParams.set("jql", jql);
      url.searchParams.set("fields", fields.join(","));
      url.searchParams.set("maxResults", "100");
      if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);
      const r = await fetch(url.toString(), {
        headers: { Authorization: auth, Accept: "application/json" },
        cache: "no-store",
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(
          `Jira search QA (sprint ${sp.id}) falló: ${r.status} ${body.slice(0, 300)}`,
        );
      }
      const data = (await r.json()) as {
        issues?: RawIssueWithCreated[];
        nextPageToken?: string;
        isLast?: boolean;
      };
      for (const it of data.issues ?? []) {
        if (seen.has(it.key)) continue;
        seen.add(it.key);
        enriched.push({
          id: it.id,
          key: it.key,
          fields: {
            summary: it.fields.summary,
            status: it.fields.status,
            issuetype: it.fields.issuetype,
            priority: it.fields.priority,
            assignee: it.fields.assignee,
            updated: it.fields.updated,
            labels: it.fields.labels ?? [],
          },
          webUrl: `${site}/browse/${it.key}`,
          sprintId: sp.id,
          sprintName: sp.name,
          createdAt: it.fields.created,
        });
      }
      nextPageToken = data.isLast === false ? data.nextPageToken : undefined;
      safety++;
    } while (nextPageToken && safety < 20);
  }

  const changelogs = new Map<string, StatusTransition[]>();
  const concurrency = 5;
  let cursor = 0;
  async function worker() {
    while (cursor < enriched.length) {
      const idx = cursor++;
      const issue = enriched[idx];
      const tx = await fetchIssueStatusTransitions(issue.key, site, auth);
      changelogs.set(issue.key, tx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, enriched.length) }, () => worker()),
  );

  return { issues: enriched, changelogs };
}

export async function fetchCompletionStats(
  sprints: JiraSprintRef[],
  cfg?: Partial<ServiceConfig>,
): Promise<QaCompletionStats> {
  const merged = { ...getServiceConfigFromEnv(), ...cfg };
  const { site, email, token, projectKey } = merged;
  const auth = basicAuthHeader(email, token);

  const perSprint: QaCompletionStats["perSprint"] = [];
  let globalQa = 0;
  let globalNoQa = 0;

  for (const sp of sprints) {
    const [qa, noQa] = await Promise.all([
      countSprintDoneByLabel(site, auth, projectKey, sp.id, "QA"),
      countSprintDoneByLabel(site, auth, projectKey, sp.id, "No-QA"),
    ]);
    perSprint.push({ sprintId: sp.id, sprintName: sp.name, qa, noQa });
    globalQa += qa;
    globalNoQa += noQa;
  }

  return { perSprint, global: { qa: globalQa, noQa: globalNoQa } };
}

async function countSprintDoneByLabel(
  site: string,
  auth: string,
  projectKey: string,
  sprintId: number,
  label: string,
): Promise<number> {
  const jql = `project = ${projectKey} AND sprint = ${sprintId} AND statusCategory = Done AND labels = "${label}"`;
  let count = 0;
  let nextPageToken: string | undefined;
  let safety = 0;
  do {
    const url = new URL(`${site}/rest/api/3/search/jql`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("fields", "summary");
    url.searchParams.set("maxResults", "100");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);
    const r = await fetch(url.toString(), {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(
        `Jira count "${label}" sprint ${sprintId} falló: ${r.status} ${body.slice(0, 200)}`,
      );
    }
    const data = (await r.json()) as {
      issues?: Array<{ key: string }>;
      nextPageToken?: string;
      isLast?: boolean;
    };
    count += (data.issues ?? []).length;
    nextPageToken = data.isLast === false ? data.nextPageToken : undefined;
    safety++;
  } while (nextPageToken && safety < 20);
  return count;
}

async function fetchIssueStatusTransitions(
  key: string,
  site: string,
  auth: string,
): Promise<StatusTransition[]> {
  const histories: RawChangelogHistory[] = [];
  let startAt = 0;
  let safety = 0;
  while (safety < 20) {
    const url = new URL(`${site}/rest/api/3/issue/${encodeURIComponent(key)}/changelog`);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", "100");
    const r = await fetch(url.toString(), {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(
        `Jira changelog ${key} falló: ${r.status} ${body.slice(0, 200)}`,
      );
    }
    const data = (await r.json()) as {
      values?: RawChangelogHistory[];
      isLast?: boolean;
      total?: number;
    };
    for (const h of data.values ?? []) histories.push(h);
    if (data.isLast || !data.values || data.values.length === 0) break;
    startAt += data.values.length;
    safety++;
  }
  return extractStatusTransitions(histories);
}
