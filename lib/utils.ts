import type { JiraIssue, StatusCategoryKey } from "./types";

// =============================================================
// Helpers de dominio
// =============================================================

export function statusCat(it: JiraIssue): StatusCategoryKey {
  return it.fields.status?.statusCategory?.key ?? "new";
}

export function statusName(it: JiraIssue): string {
  return it.fields.status?.name ?? "—";
}

export function typeOf(it: JiraIssue): string {
  return it.fields.issuetype?.name ?? "—";
}

export function priorityOf(it: JiraIssue): string {
  return it.fields.priority?.name ?? "—";
}

export function priorityRank(p: string): number {
  const m: Record<string, number> = {
    "Más Alto": 1,
    Highest: 1,
    Alto: 2,
    High: 2,
    Mediano: 3,
    Medium: 3,
    Bajo: 4,
    Low: 4,
    "Más Bajo": 5,
    Lowest: 5,
  };
  return m[p] ?? 99;
}

export function isBug(it: JiraIssue): boolean {
  const t = typeOf(it).toLowerCase();
  return t === "error" || t === "bug";
}

export interface ResolvedAssignee {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export function assigneeOf(it: JiraIssue): ResolvedAssignee | null {
  const a = it.fields.assignee;
  if (!a) return null;
  return {
    id: a.accountId || a.emailAddress || a.displayName,
    name: a.displayName || a.emailAddress || "Sin nombre",
    email: a.emailAddress ?? "",
    avatar: a.avatarUrls?.["32x32"],
  };
}

export function daysSinceUpdate(it: JiraIssue): number | null {
  const u = it.fields.updated;
  if (!u) return null;
  const ms = Date.now() - new Date(u).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function initials(name: string | undefined | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function statusCategoryLabel(cat: StatusCategoryKey): string {
  return cat === "done" ? "Listo" : cat === "indeterminate" ? "En curso" : "Por hacer";
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "0h";
  const totalH = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(totalH / 24);
  const hours = totalH % 24;
  if (days <= 0) return `${hours}h`;
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
}
