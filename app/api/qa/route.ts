import { NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import {
  fetchRecentSprints,
  fetchQaIssuesWithChangelog,
  fetchCompletionStats,
} from "@/lib/jira-service";
import { buildQaReport } from "@/lib/qa-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const sprints = await fetchRecentSprints();
    const [qaData, completion] = await Promise.all([
      fetchQaIssuesWithChangelog(sprints),
      fetchCompletionStats(sprints),
    ]);
    const report = buildQaReport(
      sprints,
      qaData.issues,
      qaData.changelogs,
      new Date(),
      completion,
    );
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    console.error("qa report error:", e);
    return NextResponse.json(
      { error: "qa_report_failed", message: e?.message ?? "" },
      { status: 502 },
    );
  }
}
