"use client";

import type { JiraIssue } from "@/lib/types";
import {
  assigneeOf,
  daysSinceUpdate,
  isBug,
  statusCat,
} from "@/lib/utils";

interface Props {
  issues: JiraIssue[];
}

interface Kpi {
  label: string;
  value: number | string;
  delta: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}

export function KpiRow({ issues }: Props) {
  const total = issues.length;
  const done = issues.filter((i) => statusCat(i) === "done").length;
  const prog = issues.filter((i) => statusCat(i) === "indeterminate").length;
  const todo = issues.filter((i) => statusCat(i) === "new").length;
  const bugs = issues.filter((i) => isBug(i) && statusCat(i) !== "done").length;
  const noAssign = issues.filter((i) => !assigneeOf(i)).length;
  const stale = issues.filter(
    (i) => statusCat(i) !== "done" && (daysSinceUpdate(i) ?? 0) >= 2
  ).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const kpis: Kpi[] = [
    { label: "Total", value: total, delta: "items en sprint" },
    { label: "Listo", value: done, delta: `${pct}% completado`, tone: "good" },
    { label: "En curso", value: prog, delta: "en progreso" },
    { label: "Por hacer", value: todo, delta: "pendientes" },
    {
      label: "Bugs activos",
      value: bugs,
      delta: "errores no resueltos",
      tone: bugs > 0 ? "bad" : "good",
    },
    {
      label: "Sin asignar",
      value: noAssign,
      delta: "requieren dueño",
      tone: noAssign > 0 ? "warn" : "good",
    },
    {
      label: "Stale > 2d",
      value: stale,
      delta: "sin movimiento",
      tone: stale > 0 ? "warn" : "good",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-3.5">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="bg-white border border-line rounded-xl px-3 py-2.5 shadow-card"
        >
          <div className="text-[11px] uppercase tracking-wide text-ink-soft font-semibold">
            {k.label}
          </div>
          <div
            className={
              "text-2xl font-bold mt-0.5 " +
              (k.tone === "good"
                ? "text-good"
                : k.tone === "warn"
                ? "text-warn"
                : k.tone === "bad"
                ? "text-bad"
                : "text-ink")
            }
          >
            {k.value}
          </div>
          <div className="text-[11px] text-ink-soft mt-0.5">{k.delta}</div>
        </div>
      ))}
    </div>
  );
}
