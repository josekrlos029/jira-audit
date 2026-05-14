"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { QaIssueMetrics, QaReport } from "@/lib/types";
import { classNames, formatDuration } from "@/lib/utils";

type SortKey =
  | "key"
  | "sprintName"
  | "assignee"
  | "currentStatus"
  | "msInQa"
  | "msInReturned"
  | "returnedEnters";

export function QaDashboard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<QaReport>({
    queryKey: ["qa", "report"],
    queryFn: async () => {
      const r = await fetch("/api/qa", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        throw new Error("Sesión expirada");
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${r.status}`);
      }
      return r.json();
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  return (
    <div className="max-w-[1280px] mx-auto px-5 pt-4 pb-16">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight m-0">
            🧪 QA · Tiempo en PRUEBAS QA
          </h1>
          <div className="text-xs text-ink-soft mt-1">
            Últimos 3 sprints (activo + 2 cerrados) · tareas con label{" "}
            <code className="px-1 rounded bg-muted-soft">QA</code>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Link
            href="/"
            className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium"
          >
            ← Volver al sprint
          </Link>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium disabled:opacity-50"
          >
            {isFetching ? "↻ Actualizando…" : "↻ Refrescar"}
          </button>
        </div>
      </header>

      {error && (
        <div className="my-4 px-4 py-3 rounded-xl bg-bad-soft border border-bad/20 text-bad text-sm">
          Error: {(error as Error).message}
        </div>
      )}

      {isLoading && !data ? (
        <div className="my-10 text-center text-ink-soft text-sm">
          Calculando métricas (esto puede tardar unos segundos)…
        </div>
      ) : data ? (
        <QaContent report={data} />
      ) : null}
    </div>
  );
}

function QaContent({ report }: { report: QaReport }) {
  const { global, perSprint, issues, completion } = report;

  const topSlow = useMemo(
    () => [...issues].sort((a, b) => b.msInQa - a.msInQa).slice(0, 5),
    [issues],
  );

  const totalCompleted = completion.global.qa + completion.global.noQa;
  const qaPct = totalCompleted
    ? Math.round((completion.global.qa / totalCompleted) * 100)
    : 0;
  const noQaPct = totalCompleted ? 100 - qaPct : 0;

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="Promedio en PRUEBAS QA"
          value={formatDuration(global.avgMsInQa)}
          sub={`${global.taskCount} tareas`}
        />
        <KpiCard
          label="Tiempo total acumulado"
          value={formatDuration(global.totalMsInQa)}
          sub="suma de todas las estancias"
        />
        <KpiCard
          label="Rebotes totales"
          value={String(global.totalReturns)}
          sub="entradas a DEVUELTO A DESARROLLO"
        />
        <KpiCard
          label="Sprints analizados"
          value={String(report.sprints.length)}
          sub={report.sprints.map((s) => s.name).join(" · ")}
        />
      </section>

      <section className="bg-white border border-line rounded-xl p-3.5 shadow-card mb-4">
        <h3 className="m-0 mb-2 text-sm font-semibold">
          ✅ Finalizadas: QA vs No-QA
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-brand inline-block" />
                <strong>QA</strong>
              </span>
              <span>
                <strong>{completion.global.qa}</strong>{" "}
                <span className="text-ink-soft text-xs">({qaPct}%)</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-warn inline-block" />
                <strong>No-QA</strong>
              </span>
              <span>
                <strong>{completion.global.noQa}</strong>{" "}
                <span className="text-ink-soft text-xs">({noQaPct}%)</span>
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-muted-soft overflow-hidden flex">
              <div
                className="h-full bg-brand"
                style={{ width: `${qaPct}%` }}
                title={`QA: ${completion.global.qa}`}
              />
              <div
                className="h-full bg-warn"
                style={{ width: `${noQaPct}%` }}
                title={`No-QA: ${completion.global.noQa}`}
              />
            </div>
            <div className="text-xs text-ink-soft">
              Total finalizadas: <strong>{totalCompleted}</strong> en los últimos 3 sprints
            </div>
          </div>
          <div style={{ width: "100%", height: 220 }}>
            {completion.perSprint.length === 0 ? (
              <div className="text-xs text-ink-soft py-6 text-center">
                Sin datos.
              </div>
            ) : (
              <ResponsiveContainer>
                <BarChart
                  data={completion.perSprint.map((s) => ({
                    name: s.sprintName,
                    QA: s.qa,
                    "No-QA": s.noQa,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="QA" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="No-QA" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white border border-line rounded-xl p-3.5 shadow-card mb-4">
        <h3 className="m-0 mb-2 text-sm font-semibold">
          📊 Promedio en QA por sprint
        </h3>
        {perSprint.length === 0 ? (
          <div className="text-xs text-ink-soft py-6 text-center">
            Sin sprints para mostrar.
          </div>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart
                data={perSprint.map((s) => ({
                  name: s.sprintName,
                  avgDays: +(s.avgMsInQa / (1000 * 60 * 60 * 24)).toFixed(2),
                  taskCount: s.taskCount,
                  totalReturns: s.totalReturns,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} label={{ value: "días", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number, k: string) =>
                    k === "avgDays" ? [`${v} d`, "Promedio QA"] : [v, k]
                  }
                />
                <Bar dataKey="avgDays" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="bg-white border border-line rounded-xl p-3.5 shadow-card mb-4">
        <h3 className="m-0 mb-2 text-sm font-semibold">
          🐢 Top 5 tareas más lentas en QA
        </h3>
        {topSlow.length === 0 ? (
          <div className="text-xs text-ink-soft py-4 text-center">
            Sin tareas.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {topSlow.map((t) => (
              <li key={t.key} className="py-2 flex items-center gap-3 text-sm">
                <a
                  href={t.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-brand hover:underline shrink-0"
                >
                  {t.key}
                </a>
                <span className="flex-1 truncate" title={t.summary}>
                  {t.summary}
                </span>
                <span className="text-xs text-ink-soft shrink-0">
                  {t.sprintName}
                </span>
                <span className="font-medium shrink-0">
                  {formatDuration(t.msInQa)}
                </span>
                {t.returnedEnters > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-bad-soft text-bad shrink-0">
                    {t.returnedEnters} rebote{t.returnedEnters > 1 ? "s" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <IssuesTable issues={issues} />
    </>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-xl p-3.5 shadow-card">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-ink-soft mt-1">{sub}</div>}
    </div>
  );
}

function IssuesTable({ issues }: { issues: QaIssueMetrics[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("msInQa");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...issues];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return asc ? av - bv : bv - av;
      }
      return asc
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
    return arr;
  }, [issues, sortKey, asc]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(false);
    }
  }

  return (
    <section className="bg-white border border-line rounded-xl shadow-card overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-line flex items-center justify-between">
        <h3 className="m-0 text-sm font-semibold">
          Detalle por tarea ({issues.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted-soft text-xs text-ink-soft">
            <tr>
              <Th onClick={() => toggleSort("key")} active={sortKey === "key"} asc={asc}>
                Key
              </Th>
              <th className="text-left px-3 py-2 font-medium">Título</th>
              <Th onClick={() => toggleSort("sprintName")} active={sortKey === "sprintName"} asc={asc}>
                Sprint
              </Th>
              <Th onClick={() => toggleSort("assignee")} active={sortKey === "assignee"} asc={asc}>
                Asignado
              </Th>
              <Th onClick={() => toggleSort("currentStatus")} active={sortKey === "currentStatus"} asc={asc}>
                Estado
              </Th>
              <Th onClick={() => toggleSort("msInQa")} active={sortKey === "msInQa"} asc={asc} align="right">
                Tiempo QA
              </Th>
              <Th
                onClick={() => toggleSort("msInReturned")}
                active={sortKey === "msInReturned"}
                asc={asc}
                align="right"
              >
                Tiempo devuelto
              </Th>
              <Th
                onClick={() => toggleSort("returnedEnters")}
                active={sortKey === "returnedEnters"}
                asc={asc}
                align="right"
              >
                Rebotes
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((it) => (
              <tr key={it.key} className="border-t border-line hover:bg-muted-soft/40">
                <td className="px-3 py-2">
                  <a
                    href={it.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-brand hover:underline"
                  >
                    {it.key}
                  </a>
                </td>
                <td className="px-3 py-2 max-w-[360px]">
                  <div className="truncate" title={it.summary}>
                    {it.summary}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">{it.sprintName}</td>
                <td className="px-3 py-2 text-xs">{it.assignee ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  <span
                    className={classNames(
                      "inline-block px-2 py-0.5 rounded-full",
                      it.stillOpen ? "bg-warn-soft text-warn" : "bg-muted-soft text-ink-soft",
                    )}
                  >
                    {it.currentStatus}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {formatDuration(it.msInQa)}
                </td>
                <td className="px-3 py-2 text-right">
                  {it.msInReturned > 0 ? formatDuration(it.msInReturned) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {it.returnedEnters > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-bad-soft text-bad text-xs">
                      {it.returnedEnters}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-ink-soft text-xs"
                >
                  Sin tareas con label QA en los últimos 3 sprints.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  children,
  onClick,
  active,
  asc,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  asc?: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={classNames(
        "px-3 py-2 font-medium cursor-pointer select-none whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        active && "text-ink",
      )}
    >
      {children}
      {active && <span className="ml-1">{asc ? "▲" : "▼"}</span>}
    </th>
  );
}
