import "server-only";
import type { JiraIssue, SprintFetchResult } from "./types";
import type { GeminiClient, ResponseSchema } from "./llm";
import type {
  MemoryStore,
  SprintSnapshot,
  JuniorPatterns,
} from "./memory-store";
import {
  buildPeopleContext,
  coachingTipsForPerson,
  sprintHealth,
  type CoachingTip,
  type PersonContext,
} from "./coaching";
import {
  daysSinceUpdate,
  priorityOf,
  statusCat,
  statusName,
  isBug,
} from "./utils";
import type { DigestTime } from "./digest";

// =============================================================
// LLM enhancement del digest
// =============================================================
// Toma la foto actual del sprint + memoria histórica y le pide
// a Gemini un coaching MÁS rico y contextualizado.
//
// El resultado se usa para reemplazar/ampliar la sección
// "👥 Coaching" del digest base. Si Gemini falla por cualquier
// razón, retornamos null y el caller usa el rule-based como
// fallback (lo que ya construye buildDigest sin LLM).

// -------------------------------------------------------------
// Tipos públicos
// -------------------------------------------------------------

export interface LlmEnhancedDigest {
  /** Coaching por persona, redactado por el LLM con tono cálido y específico. */
  coaching: Array<{
    personName: string;
    blocks: Array<{
      pattern: string;
      why: string;
      say: string;
      avoid?: string;
      severity: "alert" | "watch" | "calm";
      /** Citas de tickets para que el mensaje sea verificable. */
      evidenceKeys: string[];
    }>;
  }>;
  /** Observaciones a nivel equipo (NO por persona). */
  teamObservations: Array<{ point: string; detail: string }>;
  /** Notas que el LLM cree que deben quedar en memoria de largo plazo. */
  newLongTermMemory: string[];
  /** Notas por junior — irán al store de patterns. */
  juniorNotes: Array<{ personId: string; personName: string; note: string }>;
}

export interface RunLlmEnhancementArgs {
  llm: GeminiClient;
  memory: MemoryStore;
  sprint: SprintFetchResult;
  juniorIds: string[];
  time: DigestTime;
  /** Cuántos snapshots históricos pasarle al modelo (default 14, ~1 semana 2x/día). */
  historyLimit?: number;
}

// -------------------------------------------------------------
// API principal
// -------------------------------------------------------------

export async function runLlmEnhancement(
  args: RunLlmEnhancementArgs,
): Promise<LlmEnhancedDigest | null> {
  const { llm, memory, sprint, juniorIds, time, historyLimit = 14 } = args;
  const juniorSet = new Set(juniorIds);
  const people = buildPeopleContext(sprint.issues, juniorSet);
  const juniors = people.filter((p) => p.junior);

  if (juniors.length === 0) {
    // Sin juniors marcados, el LLM no tiene mucho que aportar — ahorramos costo.
    return null;
  }

  // -----------------------------------------------------------
  // Construir input rico (histórico + presente + reglas detectadas)
  // -----------------------------------------------------------
  const [history, longTerm, patternsList] = await Promise.all([
    memory.listSnapshots({ limit: historyLimit }),
    memory.readLongTermMemory(),
    memory.listJuniorPatterns(),
  ]);
  const patternsById = new Map<string, JuniorPatterns>();
  for (const p of patternsList) patternsById.set(p.id, p);

  const rulesPerPerson = juniors.map((p) => ({
    person: p,
    rules: coachingTipsForPerson(p),
    history: patternsById.get(p.id) ?? null,
  }));

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    time,
    sprint,
    people,
    rulesPerPerson,
    history,
    longTerm,
  });

  try {
    const result = await llm.generateJson<LlmEnhancedDigest>({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.4,
      maxOutputTokens: 4000,
      schema: RESPONSE_SCHEMA,
    });
    return result;
  } catch (e) {
    console.error("LLM enhancement falló, se usará rule-based:", e);
    return null;
  }
}

// -------------------------------------------------------------
// Persistir histórico al final de cada digest run
// -------------------------------------------------------------

export async function persistRun(args: {
  memory: MemoryStore;
  sprint: SprintFetchResult;
  juniorIds: string[];
  time: DigestTime;
  enhanced: LlmEnhancedDigest | null;
}): Promise<void> {
  const { memory, sprint, juniorIds, time, enhanced } = args;
  const juniorSet = new Set(juniorIds);
  const people = buildPeopleContext(sprint.issues, juniorSet);

  // 1. Snapshot
  const snap = buildSnapshot({ sprint, people, time, enhanced });
  await memory.appendSnapshot(snap);

  // 2. Actualizar patrones por junior (rule-based + nota del LLM si la hay)
  const now = new Date().toISOString();
  const llmNotesById = new Map<string, string>();
  for (const n of enhanced?.juniorNotes ?? []) {
    llmNotesById.set(n.personId, n.note);
  }
  for (const p of people.filter((x) => x.junior)) {
    const tips = coachingTipsForPerson(p);
    const prev = (await memory.getJuniorPatterns(p.id)) ?? {
      id: p.id,
      name: p.name,
      patternCounts: {},
      patternLastSeen: {},
      notes: [],
    };
    for (const t of tips) {
      prev.patternCounts[t.pattern] =
        (prev.patternCounts[t.pattern] ?? 0) + 1;
      prev.patternLastSeen[t.pattern] = now;
    }
    const llmNote = llmNotesById.get(p.id);
    if (llmNote) {
      prev.notes = [{ at: now, text: llmNote }, ...(prev.notes ?? [])];
    }
    prev.name = p.name; // mantener actualizado si cambió
    await memory.upsertJuniorPatterns(prev);
  }

  // 3. Long-term memory (acumulada, recortada a ~6000 chars)
  if (enhanced && enhanced.newLongTermMemory.length > 0) {
    const existing = await memory.readLongTermMemory();
    const dateLabel = new Date().toLocaleDateString("es-VE", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    const block =
      `\n\n## ${dateLabel} · ${time === "morning" ? "AM" : "PM"}\n` +
      enhanced.newLongTermMemory.map((s) => `- ${s}`).join("\n");
    const next = (existing + block).slice(-6000); // cap
    await memory.writeLongTermMemory(next.trimStart());
  }
}

// -------------------------------------------------------------
// Helpers internos
// -------------------------------------------------------------

function buildSnapshot(args: {
  sprint: SprintFetchResult;
  people: PersonContext[];
  time: DigestTime;
  enhanced: LlmEnhancedDigest | null;
}): SprintSnapshot {
  const { sprint, people, time, enhanced } = args;
  const juniorsCtx = people.filter((p) => p.junior);
  const juniors = juniorsCtx.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    total: p.items.length,
    done: p.items.filter((i) => statusCat(i) === "done").length,
    prog: p.items.filter((i) => statusCat(i) === "indeterminate").length,
    todo: p.items.filter((i) => statusCat(i) === "new").length,
    stuckCount: p.items.filter(
      (i) =>
        statusCat(i) === "indeterminate" && (daysSinceUpdate(i) ?? 0) >= 3,
    ).length,
    wipCount: p.items.filter((i) => statusCat(i) === "indeterminate").length,
    bugsOpen: p.items.filter((i) => isBug(i) && statusCat(i) !== "done").length,
    openKeys: p.items
      .filter((i) => statusCat(i) !== "done")
      .map((i) => i.key),
  }));
  const h = sprintHealth(sprint.issues);
  return {
    takenAt: new Date().toISOString(),
    time,
    projectKey: sprint.projectKey,
    kpis: {
      total: h.total,
      done: h.done,
      prog: h.prog,
      todo: h.todo,
      bugs: h.bugs,
      unassigned: h.unassigned,
      stale: h.stale,
      pct: h.pct,
    },
    juniors,
    observations: enhanced?.newLongTermMemory,
  };
}

function buildSystemPrompt(): string {
  return [
    "Eres asistente del líder técnico de un equipo móvil de mensajeros en Tuarmi/Farmatodo (Caracas).",
    "El líder lleva un equipo con miembros junior y necesita seguimiento de cerca SIN ser controlador ni desmotivante.",
    "Tu trabajo es leer el estado actual del sprint + el histórico que te paso y proponer 1-3 cosas concretas que el líder debe decirle hoy a cada junior.",
    "Reglas obligatorias para el coaching:",
    " • Tono profesional, cálido, directo. NUNCA condescendiente.",
    " • Cada sugerencia debe incluir una FRASE TEXTUAL que el líder pueda usar, no consejos genéricos.",
    " • Cuando aplique, incluye 'avoid' con lo que NO conviene decir (con razón).",
    " • Si el junior ya cayó varias veces en el mismo patrón (lo verás en patternCounts), reconócelo y sube la severidad/cambia el enfoque.",
    " • Si el junior cerró algo recientemente, RECONOCE eso antes de pedir más.",
    " • Para 'avoid', no pongas frases con sarcasmo ni psicologización barata.",
    " • Cita siempre los tickets Jira por su key (ADR-XXX) para que el líder pueda verificar.",
    "",
    "El líder es Jose Carlos. Stakeholders son frenéticos: hay que hacer visible el impacto en sprint sin pelearse con ellos.",
    "",
    "Sobre OBSERVACIONES DE LARGO PLAZO (newLongTermMemory):",
    " • Sólo deja 0-3 observaciones, sólo si son insights nuevos no triviales (no repitas lo de runs anteriores).",
    " • Foco en patrones de equipo, no en estado puntual del sprint.",
    " • Ejemplos buenos: 'Junior X siempre carga su WIP los lunes y se atasca el miércoles', 'El equipo tiende a dejar bugs abiertos cerca del fin del sprint'.",
    " • Ejemplos malos: 'Hay 3 items sin asignar' (eso ya está en el KPI, no es insight).",
    "",
    "Sobre juniorNotes:",
    " • Una nota corta (1 frase) por junior, ÚTIL para reabrir tu memoria en el próximo run.",
    " • Ej: 'Hoy lleva 4d con ADR-12, pareamos mañana'.",
  ].join("\n");
}

function buildUserPrompt(args: {
  time: DigestTime;
  sprint: SprintFetchResult;
  people: PersonContext[];
  rulesPerPerson: Array<{
    person: PersonContext;
    rules: CoachingTip[];
    history: JuniorPatterns | null;
  }>;
  history: SprintSnapshot[];
  longTerm: string;
}): string {
  const { time, sprint, people, rulesPerPerson, history, longTerm } = args;
  const lines: string[] = [];

  lines.push(
    `## Momento: ${time === "morning" ? "Status AM (9am)" : "Status PM (5pm)"} · Hoy: ${new Date().toLocaleString("es-VE")}`,
  );
  lines.push(`## Proyecto: ${sprint.projectKey}`);
  lines.push("");

  // KPIs del sprint
  const h = sprintHealth(sprint.issues);
  lines.push("## Estado del sprint AHORA");
  lines.push(
    `Total: ${h.total} · Listo: ${h.done} (${h.pct}%) · En curso: ${h.prog} · Por hacer: ${h.todo} · Bugs abiertos: ${h.bugs} · Sin asignar: ${h.unassigned} · Stale ≥2d: ${h.stale}`,
  );
  lines.push("");

  // Por persona (todas, no sólo juniors — el LLM necesita contexto del equipo)
  lines.push("## Foto por persona");
  for (const p of people) {
    const open = p.items.filter((i) => statusCat(i) !== "done");
    lines.push(
      `### ${p.junior ? "[JUNIOR] " : ""}${p.name} (id: ${p.id})`,
    );
    if (p.items.length === 0) {
      lines.push("- Sin items asignados");
    } else {
      for (const it of p.items.slice(0, 12)) {
        const d = daysSinceUpdate(it);
        lines.push(
          `- ${it.key} · ${statusName(it)} · ${priorityOf(it)} · ${d ?? "?"}d sin tocar · "${truncate(it.fields.summary, 80)}"`,
        );
      }
      if (p.items.length > 12) {
        lines.push(`- (+${p.items.length - 12} items más, omitidos)`);
      }
      lines.push(`- abiertos: ${open.length}`);
    }
  }
  lines.push("");

  // Reglas pre-detectadas + historia por junior
  lines.push("## Patrones pre-detectados (rule-based) por junior");
  for (const r of rulesPerPerson) {
    lines.push(`### ${r.person.name} (id: ${r.person.id})`);
    if (r.rules.length === 0) {
      lines.push("- (sin patrones detectados)");
    } else {
      for (const t of r.rules) {
        lines.push(
          `- [${t.severity}] ${t.pattern} — evidencia: ${t.evidence.map((i) => i.key).join(", ") || "—"}`,
        );
      }
    }
    if (r.history) {
      const top = Object.entries(r.history.patternCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      if (top.length > 0) {
        lines.push(
          `  HISTÓRICO: ${top.map(([k, n]) => `"${k}" ×${n}`).join(" · ")}`,
        );
      }
      const lastNote = r.history.notes?.[0];
      if (lastNote) {
        lines.push(`  ÚLTIMA NOTA (${lastNote.at}): ${lastNote.text}`);
      }
    }
  }
  lines.push("");

  // Histórico de snapshots
  if (history.length > 0) {
    lines.push("## Snapshots recientes (más reciente primero)");
    for (const s of history.slice(0, 10)) {
      lines.push(
        `- ${s.takenAt} (${s.time}): ${s.kpis.pct}% completado, ${s.kpis.stale} stale, ${s.kpis.bugs} bugs · juniors: ${s.juniors.length}`,
      );
    }
    lines.push("");
  }

  // Long-term memory
  if (longTerm.trim().length > 0) {
    lines.push("## Memoria de largo plazo (insights de runs anteriores)");
    lines.push(longTerm.trim());
    lines.push("");
  }

  lines.push(
    "Devuelve JSON conforme al schema. Mantén las frases del coaching cortas y útiles.",
  );

  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// -------------------------------------------------------------
// JSON Schema para Gemini structured output
// -------------------------------------------------------------

const RESPONSE_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    coaching: {
      type: "ARRAY",
      description: "Coaching por junior.",
      items: {
        type: "OBJECT",
        properties: {
          personName: { type: "STRING" },
          blocks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                pattern: { type: "STRING" },
                why: { type: "STRING" },
                say: { type: "STRING" },
                avoid: { type: "STRING", nullable: true },
                severity: { type: "STRING" }, // "alert" | "watch" | "calm"
                evidenceKeys: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["pattern", "why", "say", "severity", "evidenceKeys"],
            },
          },
        },
        required: ["personName", "blocks"],
      },
    },
    teamObservations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          point: { type: "STRING" },
          detail: { type: "STRING" },
        },
        required: ["point", "detail"],
      },
    },
    newLongTermMemory: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    juniorNotes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          personId: { type: "STRING" },
          personName: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: ["personId", "personName", "note"],
      },
    },
  },
  required: ["coaching", "teamObservations", "newLongTermMemory", "juniorNotes"],
};
