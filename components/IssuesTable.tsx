"use client";

import { useMemo, useState } from "react";
import type { JiraIssue } from "@/lib/types";
import {
  assigneeOf,
  daysSinceUpdate,
  isBug,
  priorityOf,
  statusCat,
  statusCategoryLabel,
  statusName,
  typeOf,
  classNames,
} from "@/lib/utils";
import type { StatusCategoryKey } from "@/lib/types";

type SortKey = "key" | "summary" | "type" | "status" | "priority" | "assignee" | "days";
type SortDir = "asc" | "desc";

interface Props {
  issues: JiraIssue[];
  juniorSet: Set<string>;
}

type StatusFilter = "all" | StatusCategoryKey;
type StaleFilter = "all" | "stale" | "fresh";
type JuniorFilter = "all" | "junior" | "senior";

export function IssuesTable({ issues, juniorSet }: Props) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("days");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [staleFilter, setStaleFilter] = useState<StaleFilter>("all");
  const [juniorFilter, setJuniorFilter] = useState<JuniorFilter>("all");

  // Derive unique values for dropdowns
  const uniqueTypes = useMemo(() => {
    const s = new Set<string>();
    for (const it of issues) s.add(typeOf(it));
    return [...s].sort();
  }, [issues]);

  const uniquePrios = useMemo(() => {
    const s = new Set<string>();
    for (const it of issues) s.add(priorityOf(it));
    return [...s].sort();
  }, [issues]);

  const uniqueAssignees = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of issues) {
      const a = assigneeOf(it);
      if (a) m.set(a.id, a.name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    prioFilter !== "all" ||
    assigneeFilter !== "all" ||
    staleFilter !== "all" ||
    juniorFilter !== "all";

  const rows = useMemo(() => {
    let filtered = issues;

    // Text search
    if (q.trim().length) {
      const s = q.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.key.toLowerCase().includes(s) ||
          i.fields.summary.toLowerCase().includes(s) ||
          statusName(i).toLowerCase().includes(s) ||
          typeOf(i).toLowerCase().includes(s) ||
          (assigneeOf(i)?.name ?? "").toLowerCase().includes(s) ||
          (i.fields.labels ?? []).some((l) => l.toLowerCase().includes(s))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((i) => statusCat(i) === statusFilter);
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((i) => typeOf(i) === typeFilter);
    }

    // Priority filter
    if (prioFilter !== "all") {
      filtered = filtered.filter((i) => priorityOf(i) === prioFilter);
    }

    // Assignee filter
    if (assigneeFilter !== "all") {
      if (assigneeFilter === "__unassigned__") {
        filtered = filtered.filter((i) => !assigneeOf(i));
      } else {
        filtered = filtered.filter((i) => assigneeOf(i)?.id === assigneeFilter);
      }
    }

    // Stale filter
    if (staleFilter === "stale") {
      filtered = filtered.filter(
        (i) => statusCat(i) !== "done" && (daysSinceUpdate(i) ?? 0) >= 2
      );
    } else if (staleFilter === "fresh") {
      filtered = filtered.filter(
        (i) => statusCat(i) === "done" || (daysSinceUpdate(i) ?? 0) < 2
      );
    }

    // Junior filter
    if (juniorFilter === "junior") {
      filtered = filtered.filter((i) => {
        const a = assigneeOf(i);
        return a ? juniorSet.has(a.id) || juniorSet.has(a.email) : false;
      });
    } else if (juniorFilter === "senior") {
      filtered = filtered.filter((i) => {
        const a = assigneeOf(i);
        if (!a) return true;
        return !(juniorSet.has(a.id) || juniorSet.has(a.email));
      });
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      const v = (it: JiraIssue): any => {
        switch (sortKey) {
          case "key":
            return it.key;
          case "summary":
            return it.fields.summary;
          case "type":
            return typeOf(it);
          case "status":
            return statusName(it);
          case "priority":
            return priorityOf(it);
          case "assignee":
            return assigneeOf(it)?.name ?? "zzz";
          case "days":
            return daysSinceUpdate(it) ?? -1;
        }
      };
      const av = v(a),
        bv = v(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [issues, q, sortKey, sortDir, statusFilter, typeFilter, prioFilter, assigneeFilter, staleFilter, juniorFilter, juniorSet]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageSafe = Math.min(page, totalPages - 1);
  const slice = rows.slice(pageSafe * pageSize, (pageSafe + 1) * pageSize);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  return (
    <div className="bg-white border border-line rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-line">
        <input
          type="search"
          placeholder="Buscar por key, resumen, asignado…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          className="flex-1 px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand"
        />
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={classNames(
            "text-xs px-3 py-1.5 rounded-md border font-medium transition-colors",
            showFilters || hasActiveFilters
              ? "bg-brand border-brand text-white"
              : "bg-white border-line-strong text-ink hover:border-brand hover:text-brand"
          )}
        >
          {hasActiveFilters ? `⚡ Filtros (${rows.length})` : "🔽 Filtros"}
        </button>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setTypeFilter("all");
              setPrioFilter("all");
              setAssigneeFilter("all");
              setStaleFilter("all");
              setJuniorFilter("all");
            }}
            className="text-xs text-bad hover:underline font-medium"
          >
            ✕ Limpiar
          </button>
        )}
        <span className="text-xs text-ink-soft">{rows.length} de {issues.length}</span>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="px-3 py-2.5 border-b border-line bg-[#f9fafb] flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Estado"
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v as StatusFilter); setPage(0); }}
            options={[
              { value: "all", label: "Todos" },
              { value: "new", label: "Por hacer" },
              { value: "indeterminate", label: "En curso" },
              { value: "done", label: "Listo" },
            ]}
          />
          <FilterSelect
            label="Tipo"
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(0); }}
            options={[
              { value: "all", label: "Todos" },
              ...uniqueTypes.map((t) => ({ value: t, label: t })),
            ]}
          />
          <FilterSelect
            label="Prioridad"
            value={prioFilter}
            onChange={(v) => { setPrioFilter(v); setPage(0); }}
            options={[
              { value: "all", label: "Todas" },
              ...uniquePrios.map((p) => ({ value: p, label: p })),
            ]}
          />
          <FilterSelect
            label="Asignado"
            value={assigneeFilter}
            onChange={(v) => { setAssigneeFilter(v); setPage(0); }}
            options={[
              { value: "all", label: "Todos" },
              { value: "__unassigned__", label: "🔴 Sin asignar" },
              ...uniqueAssignees.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
          <FilterSelect
            label="Movimiento"
            value={staleFilter}
            onChange={(v) => { setStaleFilter(v as StaleFilter); setPage(0); }}
            options={[
              { value: "all", label: "Todos" },
              { value: "stale", label: "🕒 Stale ≥2d" },
              { value: "fresh", label: "🟢 Al día" },
            ]}
          />
          {juniorSet.size > 0 && (
            <FilterSelect
              label="Rol"
              value={juniorFilter}
              onChange={(v) => { setJuniorFilter(v as JuniorFilter); setPage(0); }}
              options={[
                { value: "all", label: "Todos" },
                { value: "junior", label: "⭐ Juniors" },
                { value: "senior", label: "Seniors" },
              ]}
            />
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted-soft text-ink-soft">
            <tr>
              <Th label="Key" k="key" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width="80px" />
              <Th label="Resumen" k="summary" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Tipo" k="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width="90px" />
              <Th label="Estado" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width="180px" />
              <Th label="Prio" k="priority" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width="85px" />
              <Th label="Asignado" k="assignee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width="160px" />
              <Th label="Días sin tocar" k="days" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width="100px" />
              <th className="text-left px-3 py-2 font-semibold">Labels</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((it) => {
              const a = assigneeOf(it);
              const cat = statusCat(it);
              const isJunior = a
                ? juniorSet.has(a.id) || juniorSet.has(a.email)
                : false;
              const d = daysSinceUpdate(it);
              return (
                <tr key={it.key} className="border-t border-line hover:bg-muted-soft/50">
                  <td className="px-3 py-2 align-top">
                    <a
                      href={it.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand font-semibold hover:underline"
                    >
                      {it.key}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top">{it.fields.summary}</td>
                  <td className="px-3 py-2 align-top">{typeOf(it)}</td>
                  <td className="px-3 py-2 align-top">
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
                  </td>
                  <td className="px-3 py-2 align-top">{priorityOf(it)}</td>
                  <td className="px-3 py-2 align-top">
                    {a ? (
                      <>
                        {a.name} {isJunior && "⭐"}
                      </>
                    ) : (
                      <span className="bg-warn-soft text-warn px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                        sin asignar
                      </span>
                    )}
                  </td>
                  <td
                    className={classNames(
                      "px-3 py-2 align-top",
                      (d ?? 0) >= 3 && cat !== "done" ? "text-bad font-semibold" : ""
                    )}
                  >
                    {d ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top space-x-1">
                    {(it.fields.labels ?? []).map((l) => (
                      <span
                        key={l}
                        className="inline-block bg-muted-soft text-ink-soft px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      >
                        {l}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-ink-soft py-8">
                  No hay resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-line text-xs text-ink-soft">
        <div className="flex items-center gap-2">
          Filas:
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="border border-line-strong rounded px-1 py-0.5 bg-white text-ink"
          >
            <option>10</option>
            <option>25</option>
            <option>50</option>
            <option>100</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={pageSafe === 0}
            className="px-2 py-1 border border-line-strong rounded disabled:opacity-30"
          >
            ‹ Anterior
          </button>
          <span>
            {pageSafe + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageSafe >= totalPages - 1}
            className="px-2 py-1 border border-line-strong rounded disabled:opacity-30"
          >
            Siguiente ›
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  width,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  width?: string;
}) {
  const active = k === sortKey;
  return (
    <th
      onClick={() => onSort(k)}
      className="text-left px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap"
      style={width ? { width } : undefined}
    >
      {label}
      <span className="ml-1 text-[10px]">
        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-semibold text-ink-soft">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={classNames(
          "text-xs px-2 py-1 border rounded-md bg-white focus:outline-none focus:border-brand",
          value !== "all"
            ? "border-brand text-brand font-semibold"
            : "border-line-strong text-ink"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
