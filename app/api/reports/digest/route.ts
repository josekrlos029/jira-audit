import { NextResponse } from "next/server";
import { fetchSprintWithServiceAuth } from "@/lib/jira-service";
import { buildDigest, postToSlack, type DigestTime } from "@/lib/digest";
import { getGeminiFromEnv } from "@/lib/llm";
import { getMemoryStore } from "@/lib/memory-store";
import { runLlmEnhancement, persistRun } from "@/lib/digest-llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================
// POST /api/reports/digest?time=morning|afternoon
// GET  /api/reports/digest?time=morning|afternoon&preview=1
// =============================================================
// Trae el sprint usando service auth (API token, sin sesión),
// arma el digest AM/PM + coaching personalizado por junior, y
// lo postea a Slack vía SLACK_WEBHOOK_URL.
//
// Autenticación:
//   - Header `X-Reports-Token: <REPORTS_AUTH_TOKEN>`  (recomendado)
//   - O query string `?token=<REPORTS_AUTH_TOKEN>` (útil para Vercel Cron)
//   - O Vercel Cron pasa header `Authorization: Bearer <CRON_SECRET>`
//
// Para test local sin enviar a Slack:
//   curl 'http://localhost:3000/api/reports/digest?time=morning&preview=1&token=<TOKEN>'
//   -> devuelve JSON con `markdown` y `blocks` para inspeccionar
// -------------------------------------------------------------

function checkAuth(req: Request): boolean {
  const expected = process.env.REPORTS_AUTH_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  // Si no hay tokens configurados, exige al usuario configurarlos.
  if (!expected && !cronSecret) return false;

  const url = new URL(req.url);
  const headerToken = req.headers.get("x-reports-token") ?? "";
  const queryToken = url.searchParams.get("token") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";

  if (expected && (headerToken === expected || queryToken === expected)) {
    return true;
  }
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  return false;
}

function parseJuniorIds(): string[] {
  const raw = process.env.ARMI_JUNIORS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTime(req: Request): DigestTime {
  const t = new URL(req.url).searchParams.get("time")?.toLowerCase();
  if (t === "afternoon" || t === "pm") return "afternoon";
  if (t === "morning" || t === "am") return "morning";
  // Auto: antes de 14h Caracas (UTC-4) -> morning, después -> afternoon.
  const hour = new Date().getUTCHours() - 4;
  const adj = (hour + 24) % 24;
  return adj < 14 ? "morning" : "afternoon";
}

async function handle(req: Request, dryRun: boolean) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const time = parseTime(req);
  const juniorIds = parseJuniorIds();

  try {
    const sprint = await fetchSprintWithServiceAuth();

    // ------- LLM enhancement (opcional) -----------
    const llm = getGeminiFromEnv();
    const memory = getMemoryStore();
    let enhanced = null;
    let llmStatus: "off" | "ok" | "failed" = "off";
    if (llm) {
      try {
        enhanced = await runLlmEnhancement({
          llm,
          memory,
          sprint,
          juniorIds,
          time,
        });
        llmStatus = enhanced ? "ok" : "off";
      } catch (e) {
        console.error("LLM enhancement falló (continuamos con rule-based):", e);
        llmStatus = "failed";
      }
    }

    const digest = buildDigest({
      sprint,
      juniorIds,
      time,
      llm: enhanced
        ? {
            coaching: enhanced.coaching,
            teamObservations: enhanced.teamObservations,
          }
        : null,
    });

    // ------- Persistir snapshot + memory (no en preview) -----------
    if (!dryRun) {
      try {
        await persistRun({
          memory,
          sprint,
          juniorIds,
          time,
          enhanced,
        });
      } catch (e) {
        console.error("No se pudo persistir memoria:", e);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        time,
        llm: { status: llmStatus, model: llm?.model ?? null },
        sprint: {
          projectKey: sprint.projectKey,
          fetchedAt: sprint.fetchedAt,
          totalIssues: sprint.issues.length,
        },
        markdown: digest.markdown,
        slack: { text: digest.text, blocks: digest.blocks },
      });
    }

    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) {
      return NextResponse.json(
        {
          error: "missing_webhook",
          message:
            "Falta SLACK_WEBHOOK_URL en .env. Crea un Incoming Webhook en api.slack.com/apps -> Your App -> Incoming Webhooks.",
        },
        { status: 500 },
      );
    }

    // Safety: Slack permite máx 50 bloques; si hay más, recortamos.
    if (digest.blocks.length > 48) {
      console.warn(
        `[digest] ⚠️ Recortando bloques: ${digest.blocks.length} -> 48`,
      );
      digest.blocks.length = 48;
      digest.blocks.push({
        type: "context",
        elements: [
          { type: "mrkdwn", text: `_(mensaje recortado, ${digest.blocks.length} bloques)_` },
        ],
      } as any);
    }

    console.log(
      `[digest] Enviando a Slack: time=${time}, issues=${sprint.issues.length}, bloques=${digest.blocks.length}, textLen=${digest.text.length}`,
    );

    await postToSlack(webhook, digest);

    console.log(`[digest] ✅ Enviado exitosamente a Slack`);

    return NextResponse.json({
      ok: true,
      time,
      llm: { status: llmStatus, model: llm?.model ?? null },
      delivered: "slack",
      totalIssues: sprint.issues.length,
      slackBlocks: digest.blocks.length,
    });
  } catch (e: any) {
    console.error("[digest] ❌ Error:", e?.message ?? String(e));
    console.error("[digest] Stack:", e?.stack);
    return NextResponse.json(
      { error: "digest_failed", message: e?.message ?? String(e) },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") === "1";
  return handle(req, preview);
}

export async function POST(req: Request) {
  return handle(req, false);
}
