import type { JiraIssue, SprintFetchResult } from "./types";
import {
  buildPeopleContext,
  coachingTipsForPerson,
  sprintHealth,
  teamLevelTips,
  type CoachingTip,
  type PersonContext,
} from "./coaching";
import {
  assigneeOf,
  daysSinceUpdate,
  priorityOf,
  priorityRank,
  statusCat,
  statusName,
} from "./utils";

export type DigestTime = "morning" | "afternoon";

// =============================================================
// Builder del mensaje Slack (mrkdwn)
// =============================================================

export interface DigestInput {
  sprint: SprintFetchResult;
  juniorIds: string[];
  time: DigestTime;
  /** "es-VE" por default. */
  locale?: string;
  /** Coaching reescrito por LLM (opcional). Si está, reemplaza al rule-based. */
  llm?: LlmCoachingForDigest | null;
}

/**
 * Subset de la salida del LLM que el digest necesita.
 * (digest.ts NO importa digest-llm.ts para evitar ciclo / pesos.)
 */
export interface LlmCoachingForDigest {
  coaching: Array<{
    personName: string;
    blocks: Array<{
      pattern: string;
      why: string;
      say: string;
      avoid?: string;
      severity: "alert" | "watch" | "calm";
      evidenceKeys: string[];
    }>;
  }>;
  teamObservations: Array<{ point: string; detail: string }>;
}

export interface DigestOutput {
  /** Cuerpo en Slack mrkdwn (para el campo `text`). */
  text: string;
  /** Bloques estructurados de Slack (Block Kit). */
  blocks: SlackBlock[];
  /** Versión plana en markdown estándar (para email o preview). */
  markdown: string;
}

type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | {
      type: "section";
      text: { type: "mrkdwn"; text: string };
      fields?: { type: "mrkdwn"; text: string }[];
    }
  | { type: "divider" }
  | {
      type: "context";
      elements: { type: "mrkdwn"; text: string }[];
    };

export function buildDigest(input: DigestInput): DigestOutput {
  const { sprint, juniorIds, time } = input;
  const juniorSet = new Set(juniorIds);
  const projectKey = sprint.projectKey;
  const issues = sprint.issues;
  const people = buildPeopleContext(issues, juniorSet);
  const juniors = people.filter((p) => p.junior);
  const seniors = people.filter((p) => !p.junior);
  const health = sprintHealth(issues);
  const teamTips = teamLevelTips(issues, people);

  // -----------------------------------------------------------
  // Header + KPI
  // -----------------------------------------------------------
  const today = new Date().toLocaleDateString(input.locale ?? "es-VE", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
  const headerEmoji = time === "morning" ? "🌅" : "🌆";
  const headerLabel = time === "morning" ? "Status AM" : "Status PM";
  const headerText = `${headerEmoji} ${headerLabel} · Sprint ${projectKey} · ${today}`;

  const kpiLine =
    `*${health.pct}%* completado · ${health.done}✅ / ${health.prog}🟢 / ${health.todo}⏳ ` +
    `· ${health.bugs}🐞 · ${health.unassigned} sin asignar · ${health.stale} stale ≥2d`;

  // -----------------------------------------------------------
  // Sección "Foco del día" (AM) o "Cierres del día" (PM)
  // -----------------------------------------------------------
  let focusSection: string;
  if (time === "morning") {
    focusSection = morningFocus(issues, people);
  } else {
    focusSection = afternoonClosing(issues, people);
  }

  // -----------------------------------------------------------
  // Riesgos a la vista
  // -----------------------------------------------------------
  const risks = riskList(issues);

  // -----------------------------------------------------------
  // Coaching por junior
  // (Si hay coaching del LLM, lo usamos; si no, rule-based.)
  // -----------------------------------------------------------
  const coaching: { p: PersonContext; tips: CoachingTip[] }[] = [];
  if (input.llm && input.llm.coaching.length > 0) {
    const byName = new Map(juniors.map((p) => [p.name, p]));
    for (const c of input.llm.coaching) {
      const p = byName.get(c.personName);
      if (!p) continue;
      const tips: CoachingTip[] = c.blocks.map((b) => ({
        pattern: b.pattern,
        why: b.why,
        say: b.say,
        avoid: b.avoid,
        severity: b.severity,
        evidence: issues.filter((it) => b.evidenceKeys.includes(it.key)),
      }));
      if (tips.length > 0) coaching.push({ p, tips });
    }
  } else {
    for (const p of juniors) {
      const tips = coachingTipsForPerson(p);
      if (tips.length > 0) coaching.push({ p, tips });
    }
  }

  // -----------------------------------------------------------
  // Tips de equipo (LLM > rule-based)
  // -----------------------------------------------------------
  const llmTeam = (input.llm?.teamObservations ?? []).map((o) => ({
    pattern: o.point,
    detail: o.detail,
  }));
  const effectiveTeamTips =
    llmTeam.length > 0
      ? llmTeam
      : teamTips.map((t) => ({ pattern: t.pattern, detail: t.detail }));
  const teamTipsBlock = effectiveTeamTips
    .map((t) => `• *${t.pattern}* — ${t.detail}`)
    .join("\n");

  // -----------------------------------------------------------
  // Construir bloques Slack
  // -----------------------------------------------------------
  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: headerText } },
    { type: "section", text: { type: "mrkdwn", text: kpiLine } },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          (time === "morning" ? "*🎯 Foco del día*\n" : "*✅ Cierres y pendientes*\n") +
          (focusSection || "_(nada por destacar)_"),
      },
    },
  ];

  if (risks) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🚨 Riesgos a la vista*\n${risks}` },
    });
  }

  if (coaching.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*👥 Coaching del día — cómo hablarles a los juniors*",
      },
    });
    for (const { p, tips } of coaching) {
      const body = tips
        .map((t) => {
          const sev = sevEmoji(t.severity);
          const ev =
            t.evidence.length > 0
              ? `\n_↳ ${t.evidence
                  .slice(0, 3)
                  .map((it) => `<${it.webUrl}|${it.key}>`)
                  .join(", ")}_`
              : "";
          return (
            `${sev} *${t.pattern}*\n` +
            `> _${t.why}_\n` +
            `💬 _Decirle:_ ${t.say}` +
            (t.avoid ? `\n🚫 _Evita:_ ${t.avoid}` : "") +
            ev
          );
        })
        .join("\n\n");
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*⭐ ${p.name}*\n${body}` },
      });
    }
  }

  if (seniors.length > 0 && time === "morning") {
    // Pequeño resumen de seniors para AM, sin coaching.
    const seniorLine = seniors
      .map((p) => {
        const open = p.items.filter((i) => statusCat(i) !== "done").length;
        return `• ${p.name}: ${open} abierto${open === 1 ? "" : "s"}`;
      })
      .join("\n");
    if (seniorLine) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Resto del equipo*\n${seniorLine}` },
      });
    }
  }

  if (teamTipsBlock) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📌 Para ti como líder*\n${teamTipsBlock}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Generado ${new Date().toLocaleTimeString(input.locale ?? "es-VE", {
          hour: "2-digit",
          minute: "2-digit",
        })} · ${issues.length} items en sprint`,
      },
    ],
  });

  // -----------------------------------------------------------
  // Versión markdown plana (para email o preview API)
  // -----------------------------------------------------------
  const markdown = buildMarkdown({
    headerText,
    kpiLine,
    time,
    focusSection,
    risks,
    coaching,
    seniors,
    teamTips: effectiveTeamTips,
  });

  // Top-level `text` para Slack (fallback en notificaciones).
  const text = `${headerText}  ·  ${kpiLine.replace(/\*/g, "")}`;

  return { text, blocks, markdown };
}

// -------------------------------------------------------------
// Foco AM: qué cada quien va a empujar hoy
// -------------------------------------------------------------

function morningFocus(_issues: JiraIssue[], people: PersonContext[]): string {
  const lines: string[] = [];
  for (const p of people) {
    const inProg = p.items
      .filter((i) => statusCat(i) === "indeterminate")
      .sort(
        (a, b) => priorityRank(priorityOf(a)) - priorityRank(priorityOf(b)),
      );
    if (inProg.length === 0) continue;
    const top = inProg[0];
    const star = p.junior ? "⭐ " : "";
    const url = top.webUrl ? `<${top.webUrl}|${top.key}>` : top.key;
    lines.push(
      `• ${star}*${p.name}*: ${url} — ${truncate(top.fields.summary, 70)}${inProg.length > 1 ? ` _(+${inProg.length - 1} más)_` : ""}`,
    );
  }
  return lines.join("\n");
}

// -------------------------------------------------------------
// Cierres PM: qué se cerró + qué queda colgando
// -------------------------------------------------------------

function afternoonClosing(
  issues: JiraIssue[],
  people: PersonContext[],
): string {
  const today = issues.filter(
    (i) => statusCat(i) === "done" && (daysSinceUpdate(i) ?? 99) <= 1,
  );
  const lines: string[] = [];
  if (today.length > 0) {
    lines.push("✅ *Cerrado hoy:*");
    for (const it of today.slice(0, 10)) {
      const a = assigneeOf(it);
      const url = it.webUrl ? `<${it.webUrl}|${it.key}>` : it.key;
      lines.push(
        `   • ${url} — ${truncate(it.fields.summary, 70)}${a ? ` _(${a.name})_` : ""}`,
      );
    }
    if (today.length > 10) lines.push(`   _… y ${today.length - 10} más_`);
  } else {
    lines.push("✅ *Cerrado hoy:* _nada_");
  }
  lines.push("");
  // Pendientes en curso al final del día
  const stillProg = people
    .flatMap((p) =>
      p.items
        .filter((i) => statusCat(i) === "indeterminate")
        .map((it) => ({ p, it })),
    )
    .slice(0, 8);
  if (stillProg.length > 0) {
    lines.push("🔄 *Sigue en curso (cerrará mañana?):*");
    for (const { p, it } of stillProg) {
      const url = it.webUrl ? `<${it.webUrl}|${it.key}>` : it.key;
      lines.push(`   • ${url} _(${p.name}${p.junior ? " ⭐" : ""})_`);
    }
  }
  return lines.join("\n");
}

// -------------------------------------------------------------
// Riesgos: stale + sin asignar
// -------------------------------------------------------------

function riskList(issues: JiraIssue[]): string {
  const stale = issues
    .filter((i) => statusCat(i) !== "done")
    .map((it) => ({ it, d: daysSinceUpdate(it) ?? 0 }))
    .filter((x) => x.d >= 3)
    .sort((a, b) => b.d - a.d)
    .slice(0, 6);

  const unassigned = issues
    .filter((i) => !assigneeOf(i) && statusCat(i) !== "done")
    .slice(0, 4);

  if (stale.length === 0 && unassigned.length === 0) return "";

  const lines: string[] = [];
  for (const { it, d } of stale) {
    const url = it.webUrl ? `<${it.webUrl}|${it.key}>` : it.key;
    const a = assigneeOf(it);
    lines.push(
      `• ${url} — ${d}d sin tocar · ${statusName(it)}${a ? ` · _${a.name}_` : ""}`,
    );
  }
  for (const it of unassigned) {
    const url = it.webUrl ? `<${it.webUrl}|${it.key}>` : it.key;
    lines.push(`• ${url} — *sin asignar* · ${priorityOf(it)}`);
  }
  return lines.join("\n");
}

// -------------------------------------------------------------
// Markdown plano (para preview / email)
// -------------------------------------------------------------

function buildMarkdown(args: {
  headerText: string;
  kpiLine: string;
  time: DigestTime;
  focusSection: string;
  risks: string;
  coaching: { p: PersonContext; tips: CoachingTip[] }[];
  seniors: PersonContext[];
  teamTips: { pattern: string; detail: string }[];
}): string {
  const lines: string[] = [];
  lines.push(`# ${args.headerText.replace(/[*_]/g, "")}`);
  lines.push("");
  lines.push(args.kpiLine.replace(/\*/g, "**"));
  lines.push("");
  lines.push(args.time === "morning" ? "## 🎯 Foco del día" : "## ✅ Cierres y pendientes");
  lines.push(args.focusSection.replace(/<([^|]+)\|([^>]+)>/g, "[$2]($1)"));
  lines.push("");
  if (args.risks) {
    lines.push("## 🚨 Riesgos");
    lines.push(args.risks.replace(/<([^|]+)\|([^>]+)>/g, "[$2]($1)"));
    lines.push("");
  }
  if (args.coaching.length > 0) {
    lines.push("## 👥 Coaching — cómo hablarles a los juniors");
    for (const { p, tips } of args.coaching) {
      lines.push(`### ⭐ ${p.name}`);
      for (const t of tips) {
        lines.push(`**${sevEmoji(t.severity)} ${t.pattern}**`);
        lines.push(`> _${t.why}_`);
        lines.push(`💬 _Decirle:_ ${t.say}`);
        if (t.avoid) lines.push(`🚫 _Evita:_ ${t.avoid}`);
        if (t.evidence.length > 0) {
          lines.push(
            `↳ Evidencia: ${t.evidence
              .slice(0, 3)
              .map((it) =>
                it.webUrl ? `[${it.key}](${it.webUrl})` : it.key,
              )
              .join(", ")}`,
          );
        }
        lines.push("");
      }
    }
  }
  if (args.teamTips.length > 0) {
    lines.push("## 📌 Para ti como líder");
    for (const t of args.teamTips) {
      lines.push(`- **${t.pattern}** — ${t.detail}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function sevEmoji(s: CoachingTip["severity"]): string {
  return s === "alert" ? "🚨" : s === "watch" ? "⚠️" : "💡";
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// =============================================================
// Slack delivery helper
// =============================================================

export async function postToSlack(
  webhook: string,
  digest: DigestOutput,
): Promise<void> {
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: digest.text,
      blocks: digest.blocks,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Slack webhook falló: ${r.status} ${body.slice(0, 200)}`);
  }
}
