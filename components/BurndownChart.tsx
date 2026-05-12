"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { JiraIssue } from "@/lib/types";
import { statusCat, daysSinceUpdate } from "@/lib/utils";

interface Props {
  issues: JiraIssue[];
}

/**
 * Burndown Chart simplificado.
 *
 * Reconstruye una curva aproximada usando la fecha de `updated` de cada issue
 * que está en "done" como proxy de cuándo se cerró. No es perfecto (no tenemos
 * el changelog completo), pero da una visual suficiente para ver tendencia.
 *
 * - Línea ideal: recta de total → 0 a lo largo del sprint.
 * - Línea real: items restantes por día según la reconstrucción.
 */
export function BurndownChart({ issues }: Props) {
  const chartData = useMemo(() => computeBurndown(issues), [issues]);

  if (chartData.length < 2) {
    return (
      <div className="bg-white border border-line rounded-xl p-3.5 shadow-card">
        <h3 className="m-0 mb-2 text-sm font-semibold">📉 Burndown</h3>
        <div className="text-xs text-ink-soft py-6 text-center">
          Se necesitan al menos 2 días de datos para el burndown.
        </div>
      </div>
    );
  }

  const total = chartData[0]?.remaining ?? issues.length;

  return (
    <div className="bg-white border border-line rounded-xl p-3.5 shadow-card">
      <h3 className="m-0 mb-1 text-sm font-semibold">📉 Burndown del sprint</h3>
      <p className="m-0 mb-2 text-xs text-ink-soft">
        Items pendientes por día · línea punteada = ritmo ideal
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="idealGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.08} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            domain={[0, total]}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            formatter={(val: number, name: string) => [
              val,
              name === "remaining" ? "Pendientes" : "Ideal",
            ]}
          />
          {/* Ideal line */}
          <Area
            type="linear"
            dataKey="ideal"
            stroke="#22c55e"
            strokeDasharray="6 3"
            strokeWidth={2}
            fill="url(#idealGrad)"
            dot={false}
            name="Ideal"
          />
          {/* Real line */}
          <Area
            type="monotone"
            dataKey="remaining"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#burnGrad)"
            dot={{ r: 3, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            name="Pendientes"
          />
          {/* Today reference */}
          <ReferenceLine
            x={chartData[chartData.length - 1]?.label}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: "Hoy", fontSize: 10, fill: "#f59e0b", position: "top" }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Quick summary below chart */}
      <div className="flex items-center gap-4 mt-2 text-xs text-ink-soft border-t border-line pt-2">
        <span>
          Total: <b className="text-ink">{total}</b>
        </span>
        <span>
          Cerrados:{" "}
          <b className="text-good">
            {total - (chartData[chartData.length - 1]?.remaining ?? 0)}
          </b>
        </span>
        <span>
          Pendientes:{" "}
          <b className="text-brand">
            {chartData[chartData.length - 1]?.remaining ?? 0}
          </b>
        </span>
        {chartData.length >= 3 && (
          <span>
            Ritmo:{" "}
            <b
              className={
                getVelocityTrend(chartData) === "ahead"
                  ? "text-good"
                  : getVelocityTrend(chartData) === "behind"
                  ? "text-bad"
                  : "text-warn"
              }
            >
              {getVelocityTrend(chartData) === "ahead"
                ? "🟢 adelantado"
                : getVelocityTrend(chartData) === "behind"
                ? "🔴 atrasado"
                : "🟡 a ritmo"}
            </b>
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Lógica de cálculo
// ─────────────────────────────────────────────

interface DataPoint {
  date: string; // yyyy-MM-dd
  label: string; // dd/MM
  remaining: number;
  ideal: number;
}

function computeBurndown(issues: JiraIssue[]): DataPoint[] {
  if (issues.length === 0) return [];

  const total = issues.length;

  // Reconstruir cuándo se cerró cada issue usando `updated` para las que están "done"
  // Y cuándo se crearon las que aún están abiertas
  const closeDates: Date[] = [];
  for (const it of issues) {
    if (statusCat(it) === "done" && it.fields.updated) {
      closeDates.push(new Date(it.fields.updated));
    }
  }

  // Find the earliest "updated" across ALL issues as sprint start proxy
  const allUpdates = issues
    .map((it) => new Date(it.fields.updated))
    .filter((d) => !isNaN(d.getTime()));

  if (allUpdates.length === 0) return [];

  const minDate = new Date(Math.min(...allUpdates.map((d) => d.getTime())));
  const now = new Date();

  // Build day-by-day from minDate to now
  const startDay = stripTime(minDate);
  const endDay = stripTime(now);

  const days: string[] = [];
  const cursor = new Date(startDay);
  while (cursor <= endDay) {
    days.push(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Limit to max 30 days (reasonable sprint window)
  const relevantDays = days.slice(-30);

  // Count closes per day
  const closesPerDay = new Map<string, number>();
  for (const d of closeDates) {
    const key = toDateStr(d);
    closesPerDay.set(key, (closesPerDay.get(key) ?? 0) + 1);
  }

  // Build cumulative closes and remaining
  const data: DataPoint[] = [];
  let cumClosed = 0;

  // Count how many were already closed before the window started
  const windowStart = relevantDays[0];
  for (const d of closeDates) {
    if (toDateStr(d) < windowStart) cumClosed++;
  }

  const totalDays = relevantDays.length;

  for (let i = 0; i < relevantDays.length; i++) {
    const day = relevantDays[i];
    cumClosed += closesPerDay.get(day) ?? 0;
    const remaining = total - cumClosed;
    const idealRemaining = Math.max(
      0,
      Math.round(total - (total * (i + 1)) / totalDays)
    );

    data.push({
      date: day,
      label: formatLabel(day),
      remaining: Math.max(0, remaining),
      ideal: idealRemaining,
    });
  }

  return data;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

function getVelocityTrend(
  data: DataPoint[]
): "ahead" | "behind" | "ontrack" {
  const last = data[data.length - 1];
  if (!last) return "ontrack";
  const diff = last.remaining - last.ideal;
  if (diff <= -2) return "ahead";
  if (diff >= 2) return "behind";
  return "ontrack";
}
