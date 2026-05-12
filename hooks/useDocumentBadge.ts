"use client";

import { useEffect } from "react";
import type { JiraIssue } from "@/lib/types";
import {
  assigneeOf,
  daysSinceUpdate,
  isBug,
  statusCat,
} from "@/lib/utils";

/**
 * Actualiza el title del browser tab con un conteo de alertas
 * y cambia el favicon a rojo si hay alertas críticas.
 *
 * Formato: "(3) Sprint ADR · Armi Delivery Remo"
 *          "(!) Sprint ADR · Armi Delivery Remo"  (si hay algo grave)
 */
export function useDocumentBadge(issues: JiraIssue[]) {
  useEffect(() => {
    if (issues.length === 0) {
      document.title = "Sprint ADR · Armi Delivery Remo";
      return;
    }

    // Contar alertas
    const stale = issues.filter(
      (i) => statusCat(i) !== "done" && (daysSinceUpdate(i) ?? 0) >= 3
    ).length;

    const unassigned = issues.filter(
      (i) => !assigneeOf(i) && statusCat(i) !== "done"
    ).length;

    const criticalBugs = issues.filter(
      (i) => isBug(i) && statusCat(i) !== "done"
    ).length;

    const alertCount = stale + unassigned + criticalBugs;

    const done = issues.filter((i) => statusCat(i) === "done").length;
    const pct = Math.round((done / issues.length) * 100);

    if (alertCount > 0) {
      document.title = `(${alertCount}) ${pct}% · Sprint ADR`;
    } else {
      document.title = `${pct}% · Sprint ADR ✓`;
    }

    // Cleanup: restore title on unmount
    return () => {
      document.title = "Sprint ADR · Armi Delivery Remo";
    };
  }, [issues]);
}
