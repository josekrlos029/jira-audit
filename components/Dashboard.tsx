"use client";

import { useState } from "react";
import { useJiraSprint, REFRESH_INTERVAL_MS } from "@/hooks/useJiraSprint";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useDocumentBadge } from "@/hooks/useDocumentBadge";
import { Header } from "./Header";
import { KpiRow } from "./KpiRow";
import { AlertsPanel } from "./AlertsPanel";
import { ChartsGrid } from "./ChartsGrid";
import { BurndownChart } from "./BurndownChart";
import { PeopleGrid } from "./PeopleGrid";
import { IssuesTable } from "./IssuesTable";
import { JournalPanel } from "./JournalPanel";
import { StandupView } from "./StandupView";
import { JuniorsModal } from "./JuniorsModal";
import type { SessionUser } from "@/lib/types";
import { classNames } from "@/lib/utils";

type Tab = "resumen" | "personas" | "tabla" | "journal" | "standup";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "personas", label: "Por Persona" },
  { id: "tabla", label: "Tabla completa" },
  { id: "journal", label: "Journal" },
  { id: "standup", label: "Stand-up" },
];

interface Props {
  projectKey: string;
  projectName: string;
  site: string;
  currentUser: SessionUser | null;
}

export function Dashboard({ projectKey, projectName, site, currentUser }: Props) {
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } =
    useJiraSprint();

  const [tab, setTab] = useState<Tab>("resumen");
  const [juniors, setJuniors] = useLocalStorage<string[]>(
    "armi.sprint.juniors.v1",
    []
  );
  const [modalOpen, setModalOpen] = useState(false);

  const issues = data?.issues ?? [];
  const juniorSet = new Set(juniors);

  // Badge de urgencia en el tab del browser
  useDocumentBadge(issues);

  return (
    <div className="max-w-[1280px] mx-auto px-5 pt-4 pb-16">
      <Header
        projectKey={projectKey}
        projectName={projectName}
        site={site}
        currentUser={currentUser}
        issuesCount={issues.length}
        loading={isLoading || isFetching}
        lastFetched={data?.fetchedAt}
        nextRefreshMs={REFRESH_INTERVAL_MS}
        onRefresh={() => refetch()}
        onOpenJuniors={() => setModalOpen(true)}
        onJumpStandup={() => setTab("standup")}
      />

      {error && (
        <div className="my-4 px-4 py-3 rounded-xl bg-bad-soft border border-bad/20 text-bad text-sm">
          Error consultando Jira: {(error as Error).message}
        </div>
      )}

      {isLoading && !data ? (
        <div className="my-10 text-center text-ink-soft text-sm">
          Cargando datos del sprint…
        </div>
      ) : (
        <>
          <KpiRow issues={issues} />
          <AlertsPanel issues={issues} juniorSet={juniorSet} />

          <div className="flex gap-1 border-b border-line mb-4 mt-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={classNames(
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  tab === t.id
                    ? "text-brand border-brand font-semibold"
                    : "text-ink-soft border-transparent hover:text-ink"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "resumen" && (
            <>
              <BurndownChart issues={issues} />
              <div className="mt-3" />
              <ChartsGrid issues={issues} juniorSet={juniorSet} />
            </>
          )}
          {tab === "personas" && (
            <PeopleGrid issues={issues} juniorSet={juniorSet} />
          )}
          {tab === "tabla" && (
            <IssuesTable issues={issues} juniorSet={juniorSet} />
          )}
          {tab === "journal" && <JournalPanel />}
          {tab === "standup" && (
            <StandupView issues={issues} juniorSet={juniorSet} />
          )}
        </>
      )}

      <JuniorsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        issues={issues}
        initial={juniors}
        onSave={(arr) => {
          setJuniors(arr);
          setModalOpen(false);
        }}
      />

      <footer className="mt-12 text-center text-xs text-ink-soft">
        Datos en vivo desde Jira · refresco automático cada 5 min ·{" "}
        {dataUpdatedAt
          ? `Última actualización: ${new Date(dataUpdatedAt).toLocaleTimeString("es-VE")}`
          : ""}
      </footer>
    </div>
  );
}
