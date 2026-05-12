"use client";

import { useMemo, useState } from "react";
import type { JiraIssue } from "@/lib/types";
import {
  assigneeOf,
  daysSinceUpdate,
  initials,
  priorityOf,
  priorityRank,
  statusCat,
  statusName,
  classNames,
} from "@/lib/utils";

interface Props {
  issues: JiraIssue[];
  juniorSet: Set<string>;
}

type Horizon = 1 | 2 | 3 | 7;

interface PersonStandup {
  id: string;
  name: string;
  email: string;
  junior: boolean;
  doing: JiraIssue[];
  done: JiraIssue[];
  blockers: JiraIssue[];
  todoNext: JiraIssue[];
}

export function StandupView({ issues, juniorSet }: Props) {
  const [horizon, setHorizon] = useState<Horizon>(1);
  const [onlyJuniors, setOnlyJuniors] = useState(false);
  const [copied, setCopied] = useState(false);

  const people = useMemo<PersonStandup[]>(() => {
    const map = new Map<string, JiraIssue[]>();
    for (const it of issues) {
      const a = assigneeOf(it);
      if (!a) continue;
      if (!map.has(a.id)) map.set(a.id, []);
      map.get(a.id)!.push(it);
    }
    const arr: PersonStandup[] = [...map.entries()].map(([id, items]) => {
      const a = assigneeOf(items[0])!;
      const junior = juniorSet.has(a.id) || juniorSet.has(a.email);

      const doing = items
        .filter((i) => statusCat(i) === "indeterminate")
        .sort(
          (x, y) => priorityRank(priorityOf(x)) - priorityRank(priorityOf(y)),
        );

      const done = items
        .filter(
          (i) =>
            statusCat(i) === "done" &&
            (daysSinceUpdate(i) ?? 99) <= horizon,
        )
        .sort(
          (x, y) =>
            (daysSinceUpdate(x) ?? 99) - (daysSinceUpdate(y) ?? 99),
        );

      const blockers = items
        .filter((i) => {
          if (statusCat(i) === "done") return false;
          const d = daysSinceUpdate(i) ?? 0;
          return d >= 2;
        })
        .sort((x, y) => (daysSinceUpdate(y) ?? 0) - (daysSinceUpdate(x) ?? 0));

      const todoNext = items
        .filter((i) => statusCat(i) === "new")
        .sort(
          (x, y) => priorityRank(priorityOf(x)) - priorityRank(priorityOf(y)),
        )
        .slice(0, 3);

      return {
        id,
        name: a.name,
        email: a.email,
        junior,
        doing,
        done,
        blockers,
        todoNext,
      };
    });

    // Personas con algo activo primero, juniors arriba dentro de cada grupo,
    // alfabético en empates.
    arr.sort((a, b) => {
      const activityA =
        a.doing.length + a.blockers.length + a.done.length + a.todoNext.length;
      const activityB =
        b.doing.length + b.blockers.length + b.done.length + b.todoNext.length;
      if ((activityA === 0) !== (activityB === 0)) {
        return activityA === 0 ? 1 : -1;
      }
      if (a.junior !== b.junior) return a.junior ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return arr;
  }, [issues, juniorSet, horizon]);

  const visible = onlyJuniors ? people.filter((p) => p.junior) : people;

  const totals = useMemo(() => {
    let doing = 0;
    let done = 0;
    let blockers = 0;
    for (const p of visible) {
      doing += p.doing.length;
      done += p.done.length;
      blockers += p.blockers.length;
    }
    return { doing, done, blockers };
  }, [visible]);

  async function copyToClipboard() {
    const text = buildStandupText(visible, horizon);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: nada por ahora
    }
  }

  return (
    <div>
      {/* Barra de controles */}
      <div className="bg-white border border-line rounded-xl p-3.5 mb-3 flex flex-wrap items-center gap-2.5 shadow-card">
        <strong className="text-sm mr-1">Stand-up</strong>

        <div className="flex items-center gap-1 text-xs text-ink-soft">
          <span>Lo cerrado en los últimos:</span>
          {([1, 2, 3, 7] as Horizon[]).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={classNames(
                "px-2 py-0.5 rounded-md font-medium border transition-colors",
                horizon === h
                  ? "bg-brand border-brand text-white"
                  : "bg-white border-line-strong text-ink hover:border-brand hover:text-brand",
              )}
            >
              {h}d
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer ml-2">
          <input
            type="checkbox"
            checked={onlyJuniors}
            onChange={(e) => setOnlyJuniors(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#2f54eb]"
          />
          Solo juniors ⭐
        </label>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-xs text-ink-soft">
          <span>
            <b className="text-brand">{totals.doing}</b> en curso
          </span>
          <span>
            <b className="text-good">{totals.done}</b> listos
          </span>
          <span>
            <b className="text-bad">{totals.blockers}</b> bloqueos
          </span>
        </div>

        <button
          onClick={copyToClipboard}
          className={classNames(
            "text-xs px-3 py-1.5 rounded-md font-semibold border transition-colors",
            copied
              ? "bg-good-soft border-good text-good"
              : "bg-brand border-brand text-white hover:bg-brand-hover",
          )}
        >
          {copied ? "✓ Copiado" : "📋 Copiar standup"}
        </button>
      </div>

      {/* Lista por persona */}
      <div className="space-y-2.5">
        {visible.length === 0 && (
          <div className="bg-white border border-line rounded-xl p-6 text-center text-ink-soft text-sm shadow-card">
            {onlyJuniors
              ? "No hay juniors marcados (o no tienen actividad)."
              : "No hay personas con actividad en el sprint."}
          </div>
        )}

        {visible.map((p) => (
          <PersonBlock key={p.id} p={p} horizon={horizon} />
        ))}
      </div>
    </div>
  );
}

function PersonBlock({
  p,
  horizon,
}: {
  p: PersonStandup;
  horizon: Horizon;
}) {
  return (
    <div
      className={classNames(
        "bg-white rounded-xl p-3.5 shadow-card border",
        p.junior ? "border-[#4338ca] ring-1 ring-indigo-soft" : "border-line",
      )}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-9 h-9 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold text-sm">
          {initials(p.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">
            {p.name} {p.junior && "⭐"}
          </div>
          {p.email && (
            <div className="text-[11px] text-ink-soft truncate">{p.email}</div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-2.5">
        <Column
          title="🟢 Hoy"
          empty="Sin items en curso"
          items={p.doing}
          showStatus
        />
        <Column
          title={`✅ Cerrado (${horizon}d)`}
          empty={`Nada cerrado en ${horizon}d`}
          items={p.done}
          showDays
        />
        <Column
          title="🚧 Bloqueos / riesgo"
          empty="Sin riesgos"
          items={p.blockers}
          tone="bad"
          showDays
        />
      </div>

      {p.todoNext.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-line/70 text-xs">
          <span className="text-ink-soft">Próximo: </span>
          {p.todoNext.map((it, idx) => (
            <span key={it.key}>
              <a
                href={it.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand font-semibold hover:underline"
              >
                {it.key}
              </a>
              <span className="text-ink-soft"> ({priorityOf(it)})</span>
              {idx < p.todoNext.length - 1 && (
                <span className="text-ink-soft"> · </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  title,
  empty,
  items,
  tone,
  showStatus,
  showDays,
}: {
  title: string;
  empty: string;
  items: JiraIssue[];
  tone?: "bad";
  showStatus?: boolean;
  showDays?: boolean;
}) {
  return (
    <div>
      <div
        className={classNames(
          "text-[11px] uppercase tracking-wide font-semibold mb-1",
          tone === "bad" ? "text-bad" : "text-ink-soft",
        )}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-ink-soft italic">{empty}</div>
      ) : (
        <ul className="m-0 p-0 list-none space-y-1">
          {items.map((it) => {
            const d = daysSinceUpdate(it);
            return (
              <li
                key={it.key}
                className="text-xs leading-snug border-l-2 border-line pl-2"
              >
                <a
                  href={it.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand font-semibold hover:underline"
                >
                  {it.key}
                </a>{" "}
                <span className="text-ink">{it.fields.summary}</span>
                <div className="text-[10px] text-ink-soft mt-0.5 flex gap-1.5 flex-wrap">
                  {showStatus && <span>{statusName(it)}</span>}
                  {showDays && d !== null && (
                    <span
                      className={classNames(
                        d >= 3 && tone === "bad" ? "text-bad font-semibold" : "",
                      )}
                    >
                      {d}d
                    </span>
                  )}
                  <span>· {priorityOf(it)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function buildStandupText(people: PersonStandup[], horizon: Horizon): string {
  const today = new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
  const lines: string[] = [];
  lines.push(`*Stand-up · ${today}*`);
  lines.push("");
  for (const p of people) {
    if (
      p.doing.length === 0 &&
      p.done.length === 0 &&
      p.blockers.length === 0
    ) {
      continue;
    }
    lines.push(`👤 *${p.name}*${p.junior ? " ⭐" : ""}`);
    if (p.done.length > 0) {
      lines.push(`   ✅ Cerrado (${horizon}d):`);
      for (const it of p.done) {
        lines.push(`     • ${it.key} — ${it.fields.summary}`);
      }
    }
    if (p.doing.length > 0) {
      lines.push(`   🟢 Hoy:`);
      for (const it of p.doing) {
        lines.push(
          `     • ${it.key} — ${it.fields.summary} (${statusName(it)})`,
        );
      }
    }
    if (p.blockers.length > 0) {
      lines.push(`   🚧 Riesgo / sin movimiento:`);
      for (const it of p.blockers) {
        const d = daysSinceUpdate(it);
        lines.push(
          `     • ${it.key} — ${it.fields.summary}${d !== null ? ` (${d}d sin tocar)` : ""}`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
