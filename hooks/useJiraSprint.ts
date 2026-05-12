"use client";

import { useQuery } from "@tanstack/react-query";
import type { SprintFetchResult } from "@/lib/types";

export const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export function useJiraSprint() {
  return useQuery<SprintFetchResult>({
    queryKey: ["jira", "sprint"],
    queryFn: async () => {
      const r = await fetch("/api/jira/sprint", { cache: "no-store" });
      if (r.status === 401) {
        // Sesión perdida — redirigimos a login.
        window.location.href = "/login";
        throw new Error("Sesión expirada");
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message ?? `Error ${r.status}`);
      }
      return r.json();
    },
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
