import type { JiraIssue } from "./types";
import {
  assigneeOf,
  daysSinceUpdate,
  isBug,
  priorityOf,
  priorityRank,
  statusCat,
  statusName,
  typeOf,
} from "./utils";

// =============================================================
// Coaching tips por situación
// =============================================================
// Genera sugerencias concretas y NO genéricas sobre cómo
// hablarle a un junior dada su foto del sprint.
//
// Principio de fondo (basado en lo que pediste en tu memoria):
//   - "Desconfiar" no significa atacar — significa validar.
//   - El junior debe poder pedir ayuda sin sentirse juzgado.
//   - Hacer visible el impacto sin culpabilizar.
//   - Antes de decir "por qué no avanzas" preguntar "qué te atasca".

export type TipSeverity = "calm" | "watch" | "alert";

export interface CoachingTip {
  /** Patrón detectado en una frase corta — sirve de título. */
  pattern: string;
  /** Por qué importa esto. Una línea. */
  why: string;
  /** Frase concreta para usar en un 1:1 o un mensaje. */
  say: string;
  /** Lo que conviene NO decir. */
  avoid?: string;
  /** Severidad para ordenar y elegir color. */
  severity: TipSeverity;
  /** Issues que dispararon el tip (para citar en el mensaje). */
  evidence: JiraIssue[];
}

export interface PersonContext {
  id: string;
  name: string;
  email: string;
  junior: boolean;
  items: JiraIssue[];
}

// -------------------------------------------------------------
// API principal
// -------------------------------------------------------------

export function buildPeopleContext(
  issues: JiraIssue[],
  juniorSet: Set<string>,
): PersonContext[] {
  const map = new Map<string, JiraIssue[]>();
  for (const it of issues) {
    const a = assigneeOf(it);
    if (!a) continue;
    if (!map.has(a.id)) map.set(a.id, []);
    map.get(a.id)!.push(it);
  }
  return [...map.entries()].map(([id, items]) => {
    const a = assigneeOf(items[0])!;
    return {
      id,
      name: a.name,
      email: a.email,
      junior: juniorSet.has(a.id) || juniorSet.has(a.email),
      items,
    };
  });
}

export function coachingTipsForPerson(person: PersonContext): CoachingTip[] {
  const tips: CoachingTip[] = [];
  const open = person.items.filter((i) => statusCat(i) !== "done");

  // --- 1. Item atascado: en curso >= 3 días sin movimiento -----
  const stuck = open
    .filter((i) => statusCat(i) === "indeterminate")
    .map((it) => ({ it, d: daysSinceUpdate(it) ?? 0 }))
    .filter((x) => x.d >= 3)
    .sort((a, b) => b.d - a.d);

  if (stuck.length > 0) {
    const list = stuck
      .slice(0, 3)
      .map(({ it, d }) => `${it.key} (${d}d)`)
      .join(", ");
    tips.push({
      pattern: `Item${stuck.length > 1 ? "s" : ""} en curso sin movimiento ≥3d`,
      why: "El junior probablemente está atascado pero no sabe cómo pedir ayuda sin sentir que falló.",
      say: `Oye, vi que ${list} lleva${stuck.length === 1 ? "" : "n"} unos días sin avanzar. ¿Qué te tiene atascado? ¿Te ayudo a desbloquear o pareamos un rato?`,
      avoid:
        "Evita: '¿por qué no has avanzado?' — pone al junior a defenderse en vez de a contarte el bloqueo real.",
      severity: stuck[0].d >= 5 ? "alert" : "watch",
      evidence: stuck.map((x) => x.it),
    });
  }

  // --- 2. Item "En curso" recién tocado pero hace 2d ---------
  const cooling = open
    .filter(
      (i) =>
        statusCat(i) === "indeterminate" &&
        (daysSinceUpdate(i) ?? 0) >= 2 &&
        (daysSinceUpdate(i) ?? 0) < 3,
    )
    .map((it) => it.key);

  if (cooling.length > 0 && stuck.length === 0) {
    tips.push({
      pattern: "Item en curso enfriándose (2d sin tocar)",
      why: "Mejor preguntar ahora que dejar que llegue al rango crítico.",
      say: `Cuéntame cómo va ${cooling.join(", ")}. ¿Sigue siendo lo que estás trabajando o ya te moviste a otra cosa?`,
      severity: "watch",
      evidence: open.filter((i) => cooling.includes(i.key)),
    });
  }

  // --- 3. WIP excesivo: 3+ items en curso simultáneos --------
  const wip = open.filter((i) => statusCat(i) === "indeterminate");
  if (wip.length >= 3) {
    tips.push({
      pattern: `${wip.length} items en curso a la vez`,
      why: "WIP alto en un junior suele indicar que no sabe priorizar o que le pasan cosas sin protegerle el foco.",
      say: `Tienes ${wip.length} cosas abiertas en simultáneo (${wip
        .slice(0, 3)
        .map((i) => i.key)
        .join(", ")}). ¿Cuál vas a cerrar primero hoy? El resto las dejamos en 'por hacer' para que tengas foco.`,
      avoid:
        "Evita decir 'estás multitasking'. Mejor enmárcalo como 'te ayudo a proteger el foco'.",
      severity: wip.length >= 5 ? "alert" : "watch",
      evidence: wip,
    });
  }

  // --- 4. Bug abierto asignado al junior ---------------------
  const bugs = open.filter((i) => isBug(i));
  if (bugs.length > 0) {
    tips.push({
      pattern: `Bug${bugs.length > 1 ? "s" : ""} abierto${
        bugs.length > 1 ? "s" : ""
      } (${bugs.length})`,
      why: "Un junior puede sentirse mal teniendo un bug abierto a su nombre — o, peor, intentar 'taparlo' sin pedir ayuda.",
      say: `Vi que ${bugs[0].key} sigue abierto. ¿Ya reprodujiste? Si quieres pareamos 15 min para entender la causa raíz antes de irte por el fix.`,
      avoid:
        "Evita: '¿cómo se te pasó esto?'. El bug pasó, ya está; ahora lo arreglan juntos.",
      severity: bugs.length > 1 ? "watch" : "calm",
      evidence: bugs,
    });
  }

  // --- 5. Items "Por hacer" sin priorización clara -----------
  const todo = open.filter((i) => statusCat(i) === "new");
  if (todo.length >= 2 && wip.length === 0) {
    const top = [...todo]
      .sort((a, b) => priorityRank(priorityOf(a)) - priorityRank(priorityOf(b)))
      .slice(0, 1);
    tips.push({
      pattern: "Tiene tareas asignadas pero ninguna en curso",
      why: "Posible bloqueo silencioso o que no sabe por dónde arrancar.",
      say: `Tienes ${todo.length} tareas asignadas. Empezaría por ${top[0].key} (${priorityOf(top[0])}). ¿Te queda claro qué se espera? ¿O leemos juntos la HU?`,
      severity: "calm",
      evidence: todo,
    });
  }

  // --- 6. Sin items asignados --------------------------------
  if (person.items.length === 0) {
    tips.push({
      pattern: "Sin items asignados en el sprint",
      why: "Un junior sin tareas claras se siente flotando; o ya cerró todo y necesita siguiente paso.",
      say: `Veo que no tienes nada asignado en este sprint. Antes de cerrar el día pasemos por la pila a ver qué tomas; te recomiendo X o Y.`,
      severity: "watch",
      evidence: [],
    });
  }

  // --- 7. Todo terminado --------------------------------------
  if (person.items.length > 0 && open.length === 0) {
    tips.push({
      pattern: "Cerró todos sus items del sprint",
      why: "Reconocer el cierre es barato y construye confianza. Aprovecha para subir el siguiente reto.",
      say: `Buen trabajo cerrando todo lo del sprint. ¿Listo para tomar algo nuevo? Tengo un spike de X que podría ser bueno para ti.`,
      severity: "calm",
      evidence: [],
    });
  }

  // --- 8. Item alta prioridad sin tocar ----------------------
  const highPrioStuck = open
    .filter((i) => priorityRank(priorityOf(i)) <= 2)
    .filter((i) => (daysSinceUpdate(i) ?? 0) >= 2 && statusCat(i) === "new");

  if (highPrioStuck.length > 0) {
    tips.push({
      pattern: `Prioridad alta sin arrancar (${highPrioStuck[0].key})`,
      why: "Si el junior no entiende la urgencia, ya estamos atrasados sin saberlo.",
      say: `${highPrioStuck[0].key} es prioridad ${priorityOf(highPrioStuck[0])} y aún no la arrancamos. ¿Sabías que es urgente? Si hay algo bloqueando, dime, lo escalamos.`,
      severity: "alert",
      evidence: highPrioStuck,
    });
  }

  // --- 9. Item recientemente cerrado: reconocer --------------
  const justClosed = person.items
    .filter((i) => statusCat(i) === "done")
    .filter((i) => (daysSinceUpdate(i) ?? 99) <= 1);
  if (justClosed.length > 0 && open.length > 0) {
    tips.push({
      pattern: `Cerró ${justClosed.length} item${justClosed.length > 1 ? "s" : ""} en las últimas 24h`,
      why: "Reconocer el progreso reciente antes de pedir más. Construye confianza para que pida ayuda sin miedo.",
      say: `Buen cierre con ${justClosed[0].key}. Cuando termines lo siguiente avísame, lo reviso yo mismo.`,
      severity: "calm",
      evidence: justClosed,
    });
  }

  // Ordenar por severidad (alert > watch > calm).
  const sevRank = { alert: 0, watch: 1, calm: 2 } as const;
  tips.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return tips;
}

// =============================================================
// Tips generales del equipo (no por persona)
// =============================================================

export interface TeamTip {
  pattern: string;
  detail: string;
  severity: TipSeverity;
}

export function teamLevelTips(
  issues: JiraIssue[],
  peopleCtx: PersonContext[],
): TeamTip[] {
  const tips: TeamTip[] = [];
  const juniors = peopleCtx.filter((p) => p.junior);
  const totalJuniorOpen = juniors
    .flatMap((p) => p.items)
    .filter((i) => statusCat(i) !== "done").length;

  // 1. Carga concentrada en juniors
  if (juniors.length > 0 && peopleCtx.length > juniors.length) {
    const seniorOpen = peopleCtx
      .filter((p) => !p.junior)
      .flatMap((p) => p.items)
      .filter((i) => statusCat(i) !== "done").length;
    if (totalJuniorOpen > seniorOpen * 1.3 && seniorOpen > 0) {
      tips.push({
        pattern: "Los juniors están cargando más que los seniors",
        detail:
          "Revisa si esto es intencional (estiramos al junior) o si estás delegando demasiado en quienes menos margen tienen.",
        severity: "watch",
      });
    }
  }

  // 2. HU sin asignar pero ya está corriendo el sprint
  const unassignedOpen = issues.filter(
    (i) => !assigneeOf(i) && statusCat(i) !== "done",
  );
  if (unassignedOpen.length >= 2) {
    tips.push({
      pattern: `${unassignedOpen.length} items abiertos sin dueño`,
      detail:
        "Antes de pedirle al equipo que tome, decide tú quién la trabaja — los juniors no siempre saben qué se espera de ellos al tomar.",
      severity: "watch",
    });
  }

  // 3. Demasiados items stale para un día normal
  const stale = issues.filter(
    (i) => statusCat(i) !== "done" && (daysSinceUpdate(i) ?? 0) >= 3,
  );
  if (stale.length >= 4) {
    tips.push({
      pattern: `${stale.length} items con ≥3d sin moverse`,
      detail:
        "Patrón de equipo, no de persona. Vale la pena una standup específica para limpiar la lista antes de tomar nada nuevo.",
      severity: "alert",
    });
  }

  return tips;
}

// =============================================================
// Resumen compacto del estado del sprint
// =============================================================

export interface SprintHealth {
  total: number;
  done: number;
  prog: number;
  todo: number;
  bugs: number;
  unassigned: number;
  stale: number;
  pct: number;
}

export function sprintHealth(issues: JiraIssue[]): SprintHealth {
  const total = issues.length;
  const done = issues.filter((i) => statusCat(i) === "done").length;
  const prog = issues.filter((i) => statusCat(i) === "indeterminate").length;
  const todo = issues.filter((i) => statusCat(i) === "new").length;
  const bugs = issues.filter((i) => isBug(i) && statusCat(i) !== "done").length;
  const unassigned = issues.filter(
    (i) => !assigneeOf(i) && statusCat(i) !== "done",
  ).length;
  const stale = issues.filter(
    (i) => statusCat(i) !== "done" && (daysSinceUpdate(i) ?? 0) >= 2,
  ).length;
  return {
    total,
    done,
    prog,
    todo,
    bugs,
    unassigned,
    stale,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

// Re-export helpers usados por el digest para conveniencia
export {
  statusName,
  statusCat,
  typeOf,
  priorityOf,
  daysSinceUpdate,
  assigneeOf,
};
