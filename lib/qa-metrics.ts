import type {
  JiraIssue,
  JiraSprintRef,
  QaCompletionStats,
  QaIssueMetrics,
  QaReport,
  QaSprintSummary,
} from "./types";

export const QA_STATUS = "PRUEBAS QA";
export const RETURNED_STATUS = "DEVUELTO A DESARROLLO";

export interface StatusTransition {
  created: string;
  from: string | null;
  to: string | null;
}

export interface RawChangelogHistory {
  id?: string;
  created: string;
  items?: Array<{
    field?: string;
    fieldId?: string;
    fromString?: string | null;
    toString?: string | null;
  }>;
}

export function extractStatusTransitions(
  histories: RawChangelogHistory[],
): StatusTransition[] {
  const out: StatusTransition[] = [];
  for (const h of histories ?? []) {
    for (const it of h.items ?? []) {
      if ((it.field ?? "").toLowerCase() === "status") {
        out.push({
          created: h.created,
          from: it.fromString ?? null,
          to: it.toString ?? null,
        });
      }
    }
  }
  out.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  return out;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLocaleUpperCase("es");
}

interface StateDuration {
  totalMs: number;
  enters: number;
  stillIn: boolean;
}

export function computeStateDuration(
  transitions: StatusTransition[],
  targetStatus: string,
  currentStatus: string,
  issueCreatedAt: string,
  now: Date,
): StateDuration {
  const target = normalize(targetStatus);
  const nowMs = now.getTime();
  let totalMs = 0;
  let enters = 0;

  let inState = false;
  let enteredAt = 0;

  if (transitions.length > 0) {
    const firstFrom = normalize(transitions[0].from);
    if (firstFrom === target) {
      inState = true;
      enters = 1;
      enteredAt = new Date(issueCreatedAt).getTime();
    }
  } else {
    if (normalize(currentStatus) === target) {
      return {
        totalMs: Math.max(0, nowMs - new Date(issueCreatedAt).getTime()),
        enters: 1,
        stillIn: true,
      };
    }
    return { totalMs: 0, enters: 0, stillIn: false };
  }

  for (const t of transitions) {
    const tMs = new Date(t.created).getTime();
    const to = normalize(t.to);
    const from = normalize(t.from);
    if (to === target) {
      inState = true;
      enters += 1;
      enteredAt = tMs;
    } else if (from === target && inState) {
      totalMs += Math.max(0, tMs - enteredAt);
      inState = false;
    }
  }

  let stillIn = false;
  if (inState) {
    totalMs += Math.max(0, nowMs - enteredAt);
    stillIn = true;
  }

  return { totalMs, enters, stillIn };
}

export function buildQaReport(
  sprints: JiraSprintRef[],
  issues: Array<JiraIssue & { sprintId: number; sprintName: string; createdAt: string }>,
  changelogs: Map<string, StatusTransition[]>,
  now: Date,
  completion: QaCompletionStats,
): QaReport {
  const metrics: QaIssueMetrics[] = issues.map((it) => {
    const tx = changelogs.get(it.key) ?? [];
    const currentStatus = it.fields.status?.name ?? "";
    const qa = computeStateDuration(tx, QA_STATUS, currentStatus, it.createdAt, now);
    const ret = computeStateDuration(tx, RETURNED_STATUS, currentStatus, it.createdAt, now);
    return {
      key: it.key,
      summary: it.fields.summary,
      webUrl: it.webUrl ?? "",
      sprintId: it.sprintId,
      sprintName: it.sprintName,
      assignee: it.fields.assignee?.displayName ?? null,
      currentStatus,
      labels: it.fields.labels ?? [],
      msInQa: qa.totalMs,
      msInReturned: ret.totalMs,
      qaEnters: qa.enters,
      returnedEnters: ret.enters,
      stillOpen: qa.stillIn || ret.stillIn,
    };
  });

  const perSprint: QaSprintSummary[] = sprints.map((sp) => {
    const sub = metrics.filter((m) => m.sprintId === sp.id);
    const totalMs = sub.reduce((a, m) => a + m.msInQa, 0);
    const totalReturns = sub.reduce((a, m) => a + m.returnedEnters, 0);
    return {
      sprintId: sp.id,
      sprintName: sp.name,
      state: sp.state,
      taskCount: sub.length,
      avgMsInQa: sub.length ? totalMs / sub.length : 0,
      totalReturns,
    };
  });

  const totalMsInQa = metrics.reduce((a, m) => a + m.msInQa, 0);
  const totalReturns = metrics.reduce((a, m) => a + m.returnedEnters, 0);

  return {
    fetchedAt: now.toISOString(),
    sprints,
    issues: metrics,
    perSprint,
    global: {
      taskCount: metrics.length,
      avgMsInQa: metrics.length ? totalMsInQa / metrics.length : 0,
      totalMsInQa,
      totalReturns,
    },
    completion,
  };
}
