"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { JiraIssue } from "@/lib/types";
import {
  assigneeOf,
  priorityOf,
  statusCat,
  typeOf,
} from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  "Por hacer": "#9ca3af",
  "En curso": "#3b82f6",
  Listo: "#22c55e",
};
const PRIO_ORDER = ["Más Alto", "Alto", "Mediano", "Bajo", "Más Bajo"];
const PRIO_COLORS = ["#dc2626", "#ea580c", "#f59e0b", "#10b981", "#0ea5e9"];

interface Props {
  issues: JiraIssue[];
  juniorSet: Set<string>;
}

export function ChartsGrid({ issues, juniorSet }: Props) {
  const statusData = [
    { name: "Por hacer", value: issues.filter((i) => statusCat(i) === "new").length },
    { name: "En curso", value: issues.filter((i) => statusCat(i) === "indeterminate").length },
    { name: "Listo", value: issues.filter((i) => statusCat(i) === "done").length },
  ];

  const typeMap = new Map<string, number>();
  for (const it of issues) typeMap.set(typeOf(it), (typeMap.get(typeOf(it)) ?? 0) + 1);
  const typeData = [...typeMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const prioMap = new Map<string, number>();
  for (const it of issues) prioMap.set(priorityOf(it), (prioMap.get(priorityOf(it)) ?? 0) + 1);
  const prioData = [
    ...PRIO_ORDER.filter((p) => prioMap.has(p)).map((p) => ({ name: p, value: prioMap.get(p)! })),
    ...[...prioMap.entries()]
      .filter(([k]) => !PRIO_ORDER.includes(k))
      .map(([name, value]) => ({ name, value })),
  ];

  const assMap = new Map<string, { value: number; junior: boolean }>();
  for (const it of issues) {
    const a = assigneeOf(it);
    const key = a ? a.name : "Sin asignar";
    const junior = a ? juniorSet.has(a.id) || juniorSet.has(a.email) : false;
    const cur = assMap.get(key);
    assMap.set(key, { value: (cur?.value ?? 0) + 1, junior });
  }
  const assData = [...assMap.entries()]
    .map(([name, info]) => ({
      name: info.junior ? `${name} ⭐` : name,
      value: info.value,
      junior: info.junior,
      none: name === "Sin asignar",
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <ChartCard title="Progreso por estado" hint="Distribución por categoría (Por hacer · En curso · Listo)">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {statusData.map((d) => (
                <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? "#999"} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Distribución por tipo" hint="Historias, Tareas, Errores y subtareas">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={typeData} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis dataKey="name" type="category" width={90} />
            <Tooltip />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Carga por persona" hint="Items asignados — juniors marcados con ⭐">
        <ResponsiveContainer width="100%" height={Math.max(240, assData.length * 32 + 40)}>
          <BarChart data={assData} layout="vertical" margin={{ left: 20, right: 30 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis dataKey="name" type="category" width={150} />
            <Tooltip />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {assData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.none ? "#9ca3af" : d.junior ? "#4338ca" : "#2f54eb"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Prioridades" hint="Cuántos items por nivel de prioridad">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={prioData} margin={{ left: 0, right: 10 }}>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {prioData.map((d, i) => (
                <Cell key={i} fill={PRIO_COLORS[i] ?? "#888"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-line rounded-xl p-3.5 shadow-card">
      <h3 className="m-0 mb-2 text-sm font-semibold">{title}</h3>
      {hint && <div className="text-xs text-ink-soft -mt-1.5 mb-2">{hint}</div>}
      {children}
    </div>
  );
}
