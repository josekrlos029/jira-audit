"use client";

import type { JiraIssue } from "@/lib/types";
import {
  assigneeOf,
  daysSinceUpdate,
  priorityOf,
  priorityRank,
  statusCat,
  statusName,
  typeOf,
} from "@/lib/utils";

interface Props {
  issues: JiraIssue[];
  juniorSet: Set<string>;
}

export function AlertsPanel({ issues, juniorSet }: Props) {
  const stale = issues
    .filter((i) => statusCat(i) !== "done")
    .map((it) => ({ it, d: daysSinceUpdate(it) ?? 0 }))
    .filter((x) => x.d >= 2)
    .sort((a, b) => b.d - a.d)
    .slice(0, 12);

  const unassigned = issues.filter((i) => !assigneeOf(i) && statusCat(i) !== "done");

  const todoTop = issues
    .filter((i) => statusCat(i) === "new")
    .sort((a, b) => priorityRank(priorityOf(a)) - priorityRank(priorityOf(b)))
    .slice(0, 12);

  const cards: { ttl: string; n: number; tone: "danger" | "warn" | "info"; body: React.ReactNode }[] = [
    {
      ttl: "🕒 Sin movimiento >2 días",
      n: stale.length,
      tone: stale.length > 0 ? "warn" : "info",
      body:
        stale.length === 0 ? (
          <li className="text-ink-soft italic py-1">Todo se está moviendo. 👌</li>
        ) : (
          stale.map(({ it, d }) => (
            <AlertItem
              key={it.key}
              it={it}
              meta={`${d}d sin tocar · ${statusName(it)}`}
              juniorSet={juniorSet}
            />
          ))
        ),
    },
    {
      ttl: "👤 HU sin asignar",
      n: unassigned.length,
      tone: unassigned.length > 0 ? "danger" : "info",
      body:
        unassigned.length === 0 ? (
          <li className="text-ink-soft italic py-1">Todas las HU tienen dueño. 🎯</li>
        ) : (
          unassigned.slice(0, 12).map((it) => (
            <AlertItem
              key={it.key}
              it={it}
              meta={`${typeOf(it)} · ${priorityOf(it)}`}
              juniorSet={juniorSet}
            />
          ))
        ),
    },
    {
      ttl: "📦 Aún 'Por Hacer'",
      n: issues.filter((i) => statusCat(i) === "new").length,
      tone: todoTop.length > 5 ? "warn" : "info",
      body:
        todoTop.length === 0 ? (
          <li className="text-ink-soft italic py-1">
            No queda backlog del sprint sin arrancar. ✨
          </li>
        ) : (
          todoTop.map((it) => (
            <AlertItem
              key={it.key}
              it={it}
              meta={priorityOf(it)}
              juniorSet={juniorSet}
            />
          ))
        ),
    },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-2.5 mb-4">
      {cards.map((c, i) => (
        <div
          key={i}
          className={
            "bg-white border rounded-xl px-3.5 py-3 border-l-4 " +
            (c.tone === "danger"
              ? "border-line border-l-bad bg-[#fffafa]"
              : c.tone === "warn"
              ? "border-line border-l-warn bg-[#fffcf3]"
              : "border-line border-l-brand bg-[#f7faff]")
          }
        >
          <div className="font-semibold text-sm flex items-center justify-between">
            <span>{c.ttl}</span>
            <span className="text-lg font-bold">{c.n}</span>
          </div>
          <ul className="m-0 mt-2 p-0 list-none max-h-[220px] overflow-auto">{c.body}</ul>
        </div>
      ))}
    </div>
  );
}

function AlertItem({
  it,
  meta,
  juniorSet,
}: {
  it: JiraIssue;
  meta: string;
  juniorSet: Set<string>;
}) {
  const a = assigneeOf(it);
  const isJunior = a ? juniorSet.has(a.id) || juniorSet.has(a.email) : false;
  return (
    <li className="text-xs py-1.5 border-t border-line/70 first:border-t-0">
      <a
        href={it.webUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand font-semibold no-underline hover:underline"
      >
        {it.key}
      </a>
      <span className="text-ink-soft"> · {meta}</span>
      {a ? (
        <span className="text-ink-soft">
          {" "}
          · {a.name}
          {isJunior ? " ⭐" : ""}
        </span>
      ) : (
        <span className="inline-block ml-1 px-1.5 py-0.5 rounded-full bg-warn-soft text-warn font-semibold text-[10px]">
          sin asignar
        </span>
      )}
      <div className="text-ink mt-0.5 leading-snug">{it.fields.summary}</div>
    </li>
  );
}
