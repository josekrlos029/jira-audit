"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/types";
import { initials } from "@/lib/utils";

interface Props {
  projectKey: string;
  projectName: string;
  site: string;
  currentUser: SessionUser | null;
  issuesCount: number;
  loading: boolean;
  lastFetched?: string;
  nextRefreshMs: number;
  onRefresh: () => void;
  onOpenJuniors: () => void;
  onJumpStandup: () => void;
}

export function Header({
  projectKey,
  projectName,
  site,
  currentUser,
  issuesCount,
  loading,
  lastFetched,
  nextRefreshMs,
  onRefresh,
  onOpenJuniors,
  onJumpStandup,
}: Props) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastMs = lastFetched ? new Date(lastFetched).getTime() : null;
  const ageSec = lastMs ? Math.max(0, Math.floor((now - lastMs) / 1000)) : null;
  const nextSec = lastMs
    ? Math.max(0, Math.floor((nextRefreshMs - (now - lastMs)) / 1000))
    : null;

  return (
    <header className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight m-0">
          📋 Sprint {projectKey} · {projectName}
        </h1>
        <div className="text-xs text-ink-soft mt-1">
          {loading
            ? "Consultando Jira…"
            : `${issuesCount} items · ${ageSec !== null ? `actualizado hace ${formatAge(ageSec)}` : ""}${
                nextSec !== null ? ` · próximo refresh en ${formatAge(nextSec)}` : ""
              }`}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={onJumpStandup}
          className="text-xs px-2.5 py-1.5 rounded-md border border-transparent hover:bg-muted-soft text-ink"
          title="Ir al generador de standup"
        >
          📋 Standup
        </button>
        <Link
          href="/qa"
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium"
          title="Métricas de tiempo en PRUEBAS QA"
        >
          🧪 QA
        </Link>
        <button
          onClick={onOpenJuniors}
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium"
        >
          👥 Juniors
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium disabled:opacity-50"
        >
          {loading ? "↻ Actualizando…" : "↻ Refrescar"}
        </button>
        {site && (
          <a
            href={`${site}/issues/?jql=${encodeURIComponent(
              `project = ${projectKey} AND sprint in openSprints()`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-md border border-line-strong bg-white hover:border-brand hover:text-brand text-ink font-medium"
          >
            ↗ Abrir en Jira
          </a>
        )}
        {currentUser && (
          <div className="flex items-center gap-2 pl-2 border-l border-line">
            <div className="w-7 h-7 rounded-full bg-brand-soft text-brand flex items-center justify-center text-xs font-bold">
              {initials(currentUser.displayName)}
            </div>
            <div className="text-xs leading-tight">
              <div className="font-medium">{currentUser.displayName}</div>
              <a href="/api/auth/logout" className="text-ink-soft hover:text-bad">
                Salir
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
