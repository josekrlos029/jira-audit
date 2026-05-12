"use client";

import { useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { classNames } from "@/lib/utils";

// =============================================================
// Tipos del journal
// =============================================================

export type EntryKind =
  | "stakeholder" // pedido / request de un stakeholder
  | "decision" // decisión técnica o de producto
  | "risk" // riesgo identificado
  | "blocker" // bloqueo actual
  | "leadership" // lineamiento del jefe
  | "spike" // investigación / spike
  | "note"; // nota suelta del día

export type ImpactLevel = "alto" | "medio" | "bajo" | "ninguno";

export interface JournalEntry {
  id: string;
  createdAt: string; // ISO
  kind: EntryKind;
  title: string;
  detail: string;
  /** Sólo aplica a stakeholder / risk / leadership. */
  impact?: ImpactLevel;
  /** Texto libre que explica el impacto en sprint. */
  impactNote?: string;
  /** Quién pidió esto (stakeholder o jefe). */
  source?: string;
  /** Tags libres separados por coma. */
  tags?: string[];
  /** Ticket Jira asociado (key). */
  jiraKey?: string;
  /** Resuelto/cerrado (para riesgos y blockers). */
  resolved?: boolean;
}

const STORAGE_KEY = "armi.journal.v1";

const KIND_META: Record<
  EntryKind,
  { label: string; icon: string; bar: string; chip: string; pillBg: string }
> = {
  stakeholder: {
    label: "Pedido stakeholder",
    icon: "📣",
    bar: "border-l-brand",
    chip: "bg-brand-soft text-brand",
    pillBg: "bg-brand-soft",
  },
  decision: {
    label: "Decisión",
    icon: "🧭",
    bar: "border-l-good",
    chip: "bg-good-soft text-good",
    pillBg: "bg-good-soft",
  },
  risk: {
    label: "Riesgo",
    icon: "⚠️",
    bar: "border-l-warn",
    chip: "bg-warn-soft text-warn",
    pillBg: "bg-warn-soft",
  },
  blocker: {
    label: "Bloqueo",
    icon: "🚧",
    bar: "border-l-bad",
    chip: "bg-bad-soft text-bad",
    pillBg: "bg-bad-soft",
  },
  leadership: {
    label: "Lineamiento jefe",
    icon: "🎯",
    bar: "border-l-[#4338ca]",
    chip: "bg-indigo-soft text-[#4338ca]",
    pillBg: "bg-indigo-soft",
  },
  spike: {
    label: "Spike / investigación",
    icon: "🔬",
    bar: "border-l-muted",
    chip: "bg-muted-soft text-muted",
    pillBg: "bg-muted-soft",
  },
  note: {
    label: "Nota",
    icon: "🗒️",
    bar: "border-l-line-strong",
    chip: "bg-muted-soft text-ink-soft",
    pillBg: "bg-muted-soft",
  },
};

const IMPACT_NEEDS_IT: Record<EntryKind, boolean> = {
  stakeholder: true,
  risk: true,
  blocker: true,
  leadership: true,
  decision: false,
  spike: false,
  note: false,
};

const IMPACT_META: Record<
  ImpactLevel,
  { label: string; className: string }
> = {
  alto: { label: "Alto", className: "bg-bad-soft text-bad" },
  medio: { label: "Medio", className: "bg-warn-soft text-warn" },
  bajo: { label: "Bajo", className: "bg-good-soft text-good" },
  ninguno: { label: "Ninguno", className: "bg-muted-soft text-muted" },
};

const KIND_ORDER: EntryKind[] = [
  "stakeholder",
  "leadership",
  "decision",
  "risk",
  "blocker",
  "spike",
  "note",
];

// =============================================================
// Componente principal
// =============================================================

type Filter = "all" | EntryKind | "open";

export function JournalPanel() {
  const [entries, setEntries, hydrated] = useLocalStorage<JournalEntry[]>(
    STORAGE_KEY,
    [],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (filter === "all") return true;
        if (filter === "open") {
          return (
            (e.kind === "risk" || e.kind === "blocker") && !e.resolved
          );
        }
        return e.kind === filter;
      })
      .filter((e) => {
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          (e.detail ?? "").toLowerCase().includes(q) ||
          (e.source ?? "").toLowerCase().includes(q) ||
          (e.jiraKey ?? "").toLowerCase().includes(q) ||
          (e.impactNote ?? "").toLowerCase().includes(q) ||
          (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [entries, filter, query]);

  const counts = useMemo(() => {
    const c: Record<EntryKind, number> = {
      stakeholder: 0,
      decision: 0,
      risk: 0,
      blocker: 0,
      leadership: 0,
      spike: 0,
      note: 0,
    };
    let open = 0;
    for (const e of entries) {
      c[e.kind] = (c[e.kind] ?? 0) + 1;
      if ((e.kind === "risk" || e.kind === "blocker") && !e.resolved) open += 1;
    }
    return { c, open };
  }, [entries]);

  function addEntry(entry: Omit<JournalEntry, "id" | "createdAt">) {
    const full: JournalEntry = {
      ...entry,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    setEntries((prev) => [full, ...prev]);
    setShowForm(false);
  }

  function updateEntry(id: string, patch: Partial<JournalEntry>) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  }

  function removeEntry(id: string) {
    if (!confirm("¿Borrar esta entrada del journal?")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function exportMarkdown() {
    const md = buildMarkdown(entries);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `journal-armi-${today}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const data = JSON.stringify(entries, null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `journal-armi-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported: JournalEntry[] = JSON.parse(text);
        if (!Array.isArray(imported)) {
          setImportMsg("❌ El archivo no contiene un array de entradas.");
          return;
        }
        // Validar estructura mínima
        const valid = imported.filter(
          (e) => e && typeof e.id === "string" && typeof e.title === "string" && typeof e.kind === "string"
        );
        if (valid.length === 0) {
          setImportMsg("❌ No se encontraron entradas válidas.");
          return;
        }
        // Merge por ID: las existentes no se duplican, las nuevas se agregan
        const existingIds = new Set(entries.map((e) => e.id));
        const newEntries = valid.filter((e) => !existingIds.has(e.id));
        const updated = valid.filter((e) => existingIds.has(e.id));
        setEntries((prev) => {
          const merged = prev.map((existing) => {
            const update = updated.find((u) => u.id === existing.id);
            return update ?? existing;
          });
          return [...newEntries, ...merged];
        });
        setImportMsg(
          `✅ Importadas ${newEntries.length} nuevas, ${updated.length} actualizadas.`
        );
        setTimeout(() => setImportMsg(null), 5000);
      } catch {
        setImportMsg("❌ Error leyendo el archivo JSON.");
        setTimeout(() => setImportMsg(null), 5000);
      }
    };
    input.click();
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="bg-white border border-line rounded-xl p-3.5 mb-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm mr-1">🗒️ Journal del equipo</strong>
          <span className="text-xs text-ink-soft">
            {entries.length} entrada{entries.length === 1 ? "" : "s"} ·{" "}
            <span className={counts.open > 0 ? "text-bad font-semibold" : ""}>
              {counts.open} riesgo/bloqueo sin resolver
            </span>
          </span>

          <div className="flex-1" />

          <input
            type="search"
            placeholder="Buscar en journal…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand min-w-[200px]"
          />

          <button
            onClick={exportMarkdown}
            disabled={entries.length === 0}
            className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium disabled:opacity-40"
            title="Descargar journal como markdown"
          >
            ⬇ .md
          </button>

          <button
            onClick={exportJSON}
            disabled={entries.length === 0}
            className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium disabled:opacity-40"
            title="Descargar backup JSON del journal"
          >
            ⬇ .json
          </button>

          <button
            onClick={importJSON}
            className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-good hover:text-good text-ink font-medium"
            title="Restaurar backup JSON del journal"
          >
            ⬆ Importar
          </button>

          <button
            onClick={() => {
              setEditingId(null);
              setShowForm((v) => !v);
            }}
            className="text-xs px-3.5 py-1.5 rounded-md bg-brand text-white font-semibold hover:bg-brand-hover"
          >
            {showForm ? "× Cancelar" : "+ Nueva entrada"}
          </button>
        </div>

        {/* Chips de filtro */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {importMsg && (
            <span
              className={classNames(
                "text-xs px-2.5 py-1 rounded-md font-medium",
                importMsg.startsWith("✅")
                  ? "bg-good-soft text-good"
                  : "bg-bad-soft text-bad"
              )}
            >
              {importMsg}
            </span>
          )}
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label={`Todos (${entries.length})`}
          />
          <FilterChip
            active={filter === "open"}
            onClick={() => setFilter("open")}
            label={`🚨 Abiertos (${counts.open})`}
            tone={counts.open > 0 ? "bad" : undefined}
          />
          {KIND_ORDER.map((k) => (
            <FilterChip
              key={k}
              active={filter === k}
              onClick={() => setFilter(k)}
              label={`${KIND_META[k].icon} ${KIND_META[k].label} (${counts.c[k] ?? 0})`}
            />
          ))}
        </div>
      </div>

      {/* Formulario rápido */}
      {showForm && (
        <EntryForm
          onCancel={() => setShowForm(false)}
          onSubmit={addEntry}
        />
      )}

      {/* Lista de entradas */}
      <div className="space-y-2.5">
        {!hydrated ? (
          <div className="bg-white border border-line rounded-xl p-6 text-center text-ink-soft text-sm shadow-card">
            Cargando journal…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-line rounded-xl p-6 text-center text-ink-soft text-sm shadow-card">
            {entries.length === 0
              ? "Aún no hay entradas. Empieza registrando un pedido de stakeholder, una decisión o un riesgo."
              : "Ninguna entrada coincide con este filtro."}
          </div>
        ) : (
          filtered.map((e) =>
            editingId === e.id ? (
              <EntryForm
                key={e.id}
                initial={e}
                onCancel={() => setEditingId(null)}
                onSubmit={(patch) => {
                  updateEntry(e.id, patch);
                  setEditingId(null);
                }}
              />
            ) : (
              <EntryCard
                key={e.id}
                e={e}
                onEdit={() => setEditingId(e.id)}
                onDelete={() => removeEntry(e.id)}
                onToggleResolved={() =>
                  updateEntry(e.id, { resolved: !e.resolved })
                }
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

// =============================================================
// Tarjeta de entrada (modo lectura)
// =============================================================

function EntryCard({
  e,
  onEdit,
  onDelete,
  onToggleResolved,
}: {
  e: JournalEntry;
  onEdit: () => void;
  onDelete: () => void;
  onToggleResolved: () => void;
}) {
  const meta = KIND_META[e.kind];
  const canResolve = e.kind === "risk" || e.kind === "blocker";

  return (
    <div
      className={classNames(
        "bg-white border border-line rounded-xl p-3.5 shadow-card border-l-4",
        meta.bar,
        e.resolved && canResolve ? "opacity-60" : "",
      )}
    >
      <div className="flex items-start gap-2.5 flex-wrap">
        <span
          className={classNames(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
            meta.chip,
          )}
        >
          <span>{meta.icon}</span>
          {meta.label}
        </span>

        {e.impact && IMPACT_NEEDS_IT[e.kind] && (
          <span
            className={classNames(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
              IMPACT_META[e.impact].className,
            )}
            title="Impacto declarado en sprint"
          >
            Impacto: {IMPACT_META[e.impact].label}
          </span>
        )}

        {e.jiraKey && (
          <span className="text-[11px] font-semibold text-brand bg-brand-soft px-2 py-0.5 rounded-full">
            {e.jiraKey}
          </span>
        )}

        {e.resolved && canResolve && (
          <span className="text-[11px] font-semibold text-good bg-good-soft px-2 py-0.5 rounded-full">
            ✓ resuelto
          </span>
        )}

        <span className="flex-1" />

        <span className="text-[11px] text-ink-soft">{formatDate(e.createdAt)}</span>
      </div>

      <h3 className="text-sm font-semibold mt-2 mb-1 leading-snug">
        {e.title}
      </h3>

      {e.detail && (
        <p className="text-xs text-ink whitespace-pre-wrap leading-relaxed m-0">
          {e.detail}
        </p>
      )}

      {e.impactNote && (
        <div className="mt-2 text-xs bg-warn-soft/60 border border-warn/20 rounded-md px-2.5 py-1.5">
          <span className="font-semibold text-warn">Impacto en sprint:</span>{" "}
          <span className="text-ink">{e.impactNote}</span>
        </div>
      )}

      {(e.source || (e.tags && e.tags.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {e.source && (
            <span className="text-[11px] text-ink-soft">
              de <b className="text-ink">{e.source}</b>
            </span>
          )}
          {(e.tags ?? []).map((t) => (
            <span
              key={t}
              className="text-[10px] bg-muted-soft text-ink-soft px-1.5 py-0.5 rounded-full font-semibold"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5 text-xs">
        {canResolve && (
          <button
            onClick={onToggleResolved}
            className="text-ink-soft hover:text-good font-medium"
          >
            {e.resolved ? "↺ Reabrir" : "✓ Marcar resuelto"}
          </button>
        )}
        <button
          onClick={onEdit}
          className="text-ink-soft hover:text-brand font-medium"
        >
          ✎ Editar
        </button>
        <button
          onClick={onDelete}
          className="text-ink-soft hover:text-bad font-medium"
        >
          🗑 Borrar
        </button>
      </div>
    </div>
  );
}

// =============================================================
// Formulario de entrada
// =============================================================

function EntryForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: JournalEntry;
  onCancel: () => void;
  onSubmit: (entry: Omit<JournalEntry, "id" | "createdAt">) => void;
}) {
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? "stakeholder");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [impact, setImpact] = useState<ImpactLevel>(
    initial?.impact ?? "medio",
  );
  const [impactNote, setImpactNote] = useState(initial?.impactNote ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [jiraKey, setJiraKey] = useState(initial?.jiraKey ?? "");
  const [tagsText, setTagsText] = useState(
    initial?.tags ? initial.tags.join(", ") : "",
  );
  const [resolved, setResolved] = useState(initial?.resolved ?? false);

  const needsImpact = IMPACT_NEEDS_IT[kind];
  const canResolve = kind === "risk" || kind === "blocker";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const tags = tagsText
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
    onSubmit({
      kind,
      title: title.trim(),
      detail: detail.trim(),
      impact: needsImpact ? impact : undefined,
      impactNote: needsImpact && impactNote.trim() ? impactNote.trim() : undefined,
      source: source.trim() || undefined,
      jiraKey: jiraKey.trim().toUpperCase() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      resolved: canResolve ? resolved : undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-brand/30 rounded-xl p-3.5 mb-3 shadow-card space-y-2.5"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-ink-soft">Tipo:</span>
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={classNames(
              "px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors",
              kind === k
                ? `${KIND_META[k].chip} border-transparent`
                : "bg-white border-line-strong text-ink-soft hover:border-brand hover:text-brand",
            )}
          >
            {KIND_META[k].icon} {KIND_META[k].label}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-soft block mb-1">
          Título *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
          placeholder={placeholderForKind(kind, "title")}
          className="w-full px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-ink-soft block mb-1">
          Detalle
        </label>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          placeholder={placeholderForKind(kind, "detail")}
          className="w-full px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand"
        />
      </div>

      {needsImpact && (
        <div className="bg-warn-soft/40 border border-warn/20 rounded-md p-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-warn">
              Impacto en sprint *
            </span>
            {(Object.keys(IMPACT_META) as ImpactLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setImpact(lvl)}
                className={classNames(
                  "px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors",
                  impact === lvl
                    ? `${IMPACT_META[lvl].className} border-transparent`
                    : "bg-white border-line-strong text-ink-soft hover:border-warn",
                )}
              >
                {IMPACT_META[lvl].label}
              </button>
            ))}
          </div>
          <textarea
            value={impactNote}
            onChange={(e) => setImpactNote(e.target.value)}
            rows={2}
            placeholder="Ej: bloquea HU-API-Key, desplaza release en 2 días, requiere 1 dev senior"
            className="w-full px-3 py-1.5 border border-warn/30 rounded-md text-xs focus:outline-none focus:border-warn bg-white"
          />
          <p className="text-[11px] text-warn-soft text-warn m-0">
            Esto sirve para hacerle visible a tu jefe y stakeholders qué cuesta
            decir que sí.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1">
            Origen / pidió
          </label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={kind === "leadership" ? "Jefe" : "Producto, Comercial…"}
            className="w-full px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1">
            Jira key
          </label>
          <input
            type="text"
            value={jiraKey}
            onChange={(e) => setJiraKey(e.target.value)}
            placeholder="ADR-123"
            className="w-full px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand uppercase"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1">
            Tags
          </label>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="api, mobile, sprint-23"
            className="w-full px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {canResolve && initial && (
        <label className="flex items-center gap-2 text-xs text-ink">
          <input
            type="checkbox"
            checked={resolved}
            onChange={(e) => setResolved(e.target.checked)}
            className="w-4 h-4 accent-[#15803d]"
          />
          Marcar como resuelto
        </label>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-ink hover:bg-muted-soft"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="px-3.5 py-1.5 rounded-md bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-40"
        >
          {initial ? "Guardar cambios" : "Agregar al journal"}
        </button>
      </div>
    </form>
  );
}

// =============================================================
// Helpers
// =============================================================

function FilterChip({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: "bad";
}) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        "px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors",
        active
          ? tone === "bad"
            ? "bg-bad text-white border-bad"
            : "bg-brand text-white border-brand"
          : "bg-white border-line-strong text-ink-soft hover:border-brand hover:text-brand",
      )}
    >
      {label}
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return `hoy ${d.toLocaleTimeString("es-VE", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return d.toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function placeholderForKind(kind: EntryKind, field: "title" | "detail"): string {
  if (field === "title") {
    switch (kind) {
      case "stakeholder":
        return "Ej: Producto pide login con biometría para release de junio";
      case "leadership":
        return "Ej: Jefe pide foco en estabilidad antes de nuevas features";
      case "decision":
        return "Ej: Vamos con OAuth 3LO en vez de API token";
      case "risk":
        return "Ej: Junior 1 todavía no tiene acceso al repo móvil";
      case "blocker":
        return "Ej: Falta API key del comercio X para probar end-to-end";
      case "spike":
        return "Ej: Investigar costo de migrar push a FCM v1";
      case "note":
        return "Ej: Reunión 1:1 con junior 2 — feedback de onboarding";
    }
  }
  switch (kind) {
    case "stakeholder":
      return "Detalle del pedido, contexto, deadline esperado…";
    case "leadership":
      return "Cita textual o resumen del lineamiento, contexto…";
    case "decision":
      return "Opciones consideradas, por qué se elige esta, quién participó…";
    case "risk":
      return "Qué puede salir mal, probabilidad, qué estamos haciendo…";
    case "blocker":
      return "Qué está bloqueado, desde cuándo, a quién se le pidió ayuda…";
    case "spike":
      return "Pregunta a responder, fuentes consultadas, hallazgos…";
    case "note":
      return "Nota libre del día…";
  }
}

function buildMarkdown(entries: JournalEntry[]): string {
  const today = new Date().toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  const lines: string[] = [];
  lines.push(`# Journal Equipo Armi`);
  lines.push(`> Exportado: ${today} · ${entries.length} entradas`);
  lines.push("");

  // Agrupar por día
  const byDay = new Map<string, JournalEntry[]>();
  for (const e of [...entries].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )) {
    const day = e.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  for (const [day, items] of byDay) {
    lines.push(`## ${day}`);
    lines.push("");
    for (const e of items) {
      const meta = KIND_META[e.kind];
      lines.push(`### ${meta.icon} ${meta.label} — ${e.title}`);
      const bits: string[] = [];
      if (e.jiraKey) bits.push(`Jira: \`${e.jiraKey}\``);
      if (e.source) bits.push(`De: ${e.source}`);
      if (e.impact && IMPACT_NEEDS_IT[e.kind]) {
        bits.push(`Impacto: **${IMPACT_META[e.impact].label}**`);
      }
      if ((e.kind === "risk" || e.kind === "blocker") && e.resolved) {
        bits.push(`Estado: ✓ resuelto`);
      }
      if (bits.length > 0) {
        lines.push(`_${bits.join(" · ")}_`);
        lines.push("");
      }
      if (e.detail) {
        lines.push(e.detail);
        lines.push("");
      }
      if (e.impactNote) {
        lines.push(`> **Impacto en sprint:** ${e.impactNote}`);
        lines.push("");
      }
      if (e.tags && e.tags.length > 0) {
        lines.push(`Tags: ${e.tags.map((t) => `\`#${t}\``).join(" ")}`);
        lines.push("");
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
