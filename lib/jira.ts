import "server-only";
import type { JiraIssue, SprintFetchResult } from "./types";

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

/**
 * Devuelve TODOS los issues del / los sprint(s) activo(s) de un proyecto.
 *
 * Usa el endpoint nuevo /rest/api/3/search/jql con paginación basada en nextPageToken.
 * Excluye explícitamente description/comment/attachment para no inflar la respuesta.
 */
export async function fetchActiveSprintIssues(args: {
  accessToken: string;
  cloudId: string;
  projectKey: string;
  /** Site base URL (https://xxx.atlassian.net). Para construir webUrl. */
  site: string;
}): Promise<SprintFetchResult> {
  const { accessToken, cloudId, projectKey, site } = args;

  const jql = `project = ${projectKey} AND sprint in openSprints()`;
  const all: JiraIssue[] = [];

  let nextPageToken: string | undefined;
  let safety = 0;

  do {
    const url = new URL(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("fields", FIELDS.join(","));
    url.searchParams.set("maxResults", "100");
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);

    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Jira search falló: ${r.status} ${body.slice(0, 300)}`);
    }

    const data = (await r.json()) as {
      issues: JiraIssue[];
      nextPageToken?: string;
      isLast?: boolean;
    };

    for (const it of data.issues ?? []) {
      it.webUrl = `${site.replace(/\/$/, "")}/browse/${it.key}`;
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
