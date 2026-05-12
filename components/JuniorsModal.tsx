"use client";

import { useEffect, useMemo, useState } from "react";
import type { JiraIssue } from "@/lib/types";
import { assigneeOf, classNames, initials } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  issues: JiraIssue[];
  initial: string[];
  onSave: (arr: string[]) => void;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  count: number;
}

export function JuniorsModal({
  open,
  onClose,
  issues,
  initial,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [q, setQ] = useState("");

  // Re-sincronizar el estado interno cada vez que el modal se abre o cambia
  // la lista inicial desde localStorage.
  useEffect(() => {
    if (open) {
      setSelected(new Set(initial));
      setQ("");
    }
  }, [open, initial]);

  // Cerrar con Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const candidates: Candidate[] = useMemo(() => {
    const map = new Map<string, Candidate>();
    for (const it of issues) {
      const a = assigneeOf(it);
      if (!a) continue;
      const cur = map.get(a.id);
      if (cur) cur.count += 1;
      else map.set(a.id, { id: a.id, name: a.name, email: a.email, count: 1 });
    }
    return [...map.values()].sort((x, y) => {
      // los ya seleccionados arriba, luego por nombre
      const xs = selected.has(x.id) ? 0 : 1;
      const ys = selected.has(y.id) ? 0 : 1;
      if (xs !== ys) return xs - ys;
      return x.name.localeCompare(y.name);
    });
  }, [issues, selected]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s),
    );
  }, [candidates, q]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(candidates.map((c) => c.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleSave() {
    onSave([...selected]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Marcar juniors"
    >
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-line">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold m-0">
                👥 Marcar miembros junior
              </h2>
              <p className="text-xs text-ink-soft m-0 mt-0.5">
                Los marcados ⭐ recibirán seguimiento extra en alertas, gráficos
                y stand-up.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-ink-soft hover:text-ink text-xl leading-none px-1"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <input
            type="search"
            placeholder="Buscar persona…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-3 w-full px-3 py-1.5 border border-line-strong rounded-md text-sm focus:outline-none focus:border-brand"
          />

          <div className="flex items-center gap-2 mt-2 text-xs">
            <button
              onClick={selectAll}
              className="text-brand hover:underline font-medium"
            >
              Seleccionar todos
            </button>
            <span className="text-line-strong">·</span>
            <button
              onClick={clearAll}
              className="text-ink-soft hover:text-bad font-medium"
            >
              Limpiar
            </button>
            <span className="flex-1" />
            <span className="text-ink-soft">
              {selected.size} marcado{selected.size === 1 ? "" : "s"} de{" "}
              {candidates.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2 py-2">
          {filtered.length === 0 ? (
            <div className="text-center text-ink-soft text-sm py-8 px-4">
              {candidates.length === 0
                ? "Todavía no hay personas asignadas en el sprint."
                : "Ninguna persona coincide con la búsqueda."}
            </div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {filtered.map((c) => {
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={classNames(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                        checked
                          ? "bg-brand-soft"
                          : "hover:bg-muted-soft",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="w-4 h-4 accent-[#2f54eb]"
                      />
                      <div className="w-8 h-8 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold text-xs shrink-0">
                        {initials(c.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight">
                          {c.name}
                          {checked && " ⭐"}
                        </div>
                        {c.email && (
                          <div className="text-[11px] text-ink-soft truncate">
                            {c.email}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-ink-soft shrink-0">
                        {c.count} item{c.count === 1 ? "" : "s"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2 bg-muted-soft/40">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-ink hover:bg-muted-soft"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-3.5 py-1.5 rounded-md bg-brand text-white text-sm font-semibold hover:bg-brand-hover"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
