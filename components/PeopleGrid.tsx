"use client";

import { useState } from "react";
import type { JiraIssue } from "@/lib/types";
import {
  assigneeOf,
  daysSinceUpdate,
  initials,
  statusCat,
  statusName,
  classNames,
} from "@/lib/utils";

type Filter = "all" | "juniors" | "risk";

interface Props {
  issues: JiraIssue[];
  juniorSet: Set<string>;
}

interface PersonGroup {
  id: string;
  name: string;
  email: string;
  items: JiraIssue[];
  total: number;
  done: number;
  prog: number;
  todo: number;
  risk: boolean;
  junior: boolean;
}

export function PeopleGrid({ issues, juniorSet }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const groups = new Map<string, JiraIssue[]>();
  for (const it of issues) {
    const a = assigneeOf(it);
    const id = a?.id ?? "__none__";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(it);
  }

  const arr: PersonGroup[] = [...groups.entries()].map(([id, items]) => {
    const a = assigneeOf(items[0]);
    const done = items.filter((i) => statusCat(i) === "done").length;
    const prog = items.filter((i) => statusCat(i) === "indeterminate").length;
    const total = items.length;
    const todo = total - done - prog;
    const risk = items.some(
      (i) => statusCat(i) !== "done" && (daysSinceUpdate(i) ?? 0) >= 2
    );
    const junior = a ? juniorSet.has(a.id) || juniorSet.has(a.email) : false;
    return {
      id,
      name: a?.name ?? "Sin asignar",
      email: a?.email ?? "",
      items,
      total,
      done,
      prog,
      todo,
      risk,
      junior,
    };
  });

  arr.sort((a, b) => {
    if (a.junior !== b.junior) return a.junior ? -1 : 1;
    return b.total - a.total;
  });

  const filtered =
    filter === "juniors"
      ? arr.filter((p) => p.junior)
      : filter === "risk"
      ? arr.filter((p) => p.risk)
      : arr;

  return (
    <div>
      <div className="bg-white border border-line rounded-xl p-3.5 mb-3 flex flex-wrap items-center gap-2 shadow-card">
        <strong className="text-sm mr-1">Filtrar:</strong>
        {(
          [
            ["all", "Todos"],
            ["juniors", "Solo juniors ⭐"],
            ["risk", "Con riesgo 🚨"],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={classNames(
              "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
              filter === f
                ? "bg-brand border-brand text-white"
                : "bg-white border-line-strong text-ink hover:border-brand hover:text-brand"
            )}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-ink-soft">
          {filtered.length} persona{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((g) => (
          <PersonCard key={g.id} group={g} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-ink-soft py-10 text-sm">
            No hay personas que cumplan este filtro.
          </div>
        )}
      </div>
    </div>
  );
}

function PersonCard({ group: g }: { group: PersonGroup }) {
  const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
  const items = [...g.items].sort((a, b) => {
    const ra =
      statusCat(a) === "done" ? 2 : statusCat(a) === "indeterminate" ? 0 : 1;
    const rb =
      statusCat(b) === "done" ? 2 : statusCat(b) === "indeterminate" ? 0 : 1;
    return ra - rb;
  });

  return (
    <div
      className={classNames(
        "bg-white rounded-xl p-3.5 shadow-card border transition-colors",
        g.junior
          ? "border-[#4338ca] ring-2 ring-indigo-soft"
          : "border-line"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold text-sm">
          {initials(g.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">
            {g.name} {g.junior && "⭐"}
          </div>
          {g.email && (
            <div className="text-[11px] text-ink-soft truncate">{g.email}</div>
          )}
        </div>
        <span
          className={classNames(
            "px-2 py-0.5 rounded-full text-[11px] font-bold",
            pct === 100
              ? "bg-good-soft text-good"
              : pct >= 50
              ? "bg-brand-soft text-brand"
              : "bg-muted-soft text-muted"
          )}
        >
          {pct}%
        </span>
      </div>

      <div
        className="mt-2.5 h-2 bg-muted-soft rounded-full overflow-hidden flex"
        title={`${g.done} listo · ${g.prog} en curso · ${g.todo} por hacer`}
      >
        <span className="block h-full bg-good" style={{ width: `${(g.done / Math.max(1, g.total)) * 100}%` }} />
        <span className="block h-full bg-brand" style={{ width: `${(g.prog / Math.max(1, g.total)) * 100}%` }} />
        <span className="block h-full bg-line-strong" style={{ width: `${(g.todo / Math.max(1, g.total)) * 100}%` }} />
      </div>

      <div className="flex gap-3 mt-2 text-xs text-ink-soft items-center">
        <span><b className="text-ink font-semibold">{g.total}</b> total</span>
        <span className="text-good"><b className="font-semibold">{g.done}</b> listo</span>
        <span className="text-brand"><b className="font-semibold">{g.prog}</b> curso</span>
        <span><b className="text-ink font-semibold">{g.todo}</b> por hacer</span>
        {g.risk && (
          <span className="ml-auto bg-warn-soft text-warn px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
            🚨 riesgo
          </span>
        )}
      </div>

      <div className="mt-3 max-h-[220px] overflow-auto">
        {items.slice(0, 20).map((it) => {
          const cat = statusCat(it);
          return (
            <div
              key={it.key}
              className="text-xs py-1.5 border-t border-line/70 first:border-t-0 flex gap-2 items-baseline"
            >
              <a
                href={it.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand font-semibold no-underline hover:underline shrink-0"
              >
                {it.key}
              </a>
              <span
                className={classNames(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                  cat === "done"
                    ? "bg-good-soft text-good"
                    : cat === "indeterminate"
                    ? "bg-brand-soft text-brand"
                    : "bg-muted-soft text-muted"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {statusName(it)}
              </span>
              <span className="text-ink truncate flex-1" title={it.fields.summary}>
                {it.fields.summary}
              </span>
            </div>
          );
        })}
        {items.length > 20 && (
          <div className="text-[11px] text-ink-soft pt-1.5">
            +{items.length - 20} más
          </div>
        )}
      </div>
    </div>
  );
}
