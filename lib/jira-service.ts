import "server-only";
import type { JiraIssue, SprintFetchResult } from "./types";

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
