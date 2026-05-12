import { NextResponse } from "next/server";
import { ensureFreshToken } from "@/lib/atlassian-oauth";
import { fetchActiveSprintIssues } from "@/lib/jira";
import { getSession, isSessionValid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const ok = await ensureFreshToken(session);
  if (!ok) {
    session.destroy();
    return NextResponse.json({ error: "token_refresh_failed" }, { status: 401 });
  }
  await session.save();

  const projectKey = process.env.NEXT_PUBLIC_JIRA_PROJECT_KEY ?? "ADR";

  try {
    const result = await fetchActiveSprintIssues({
      accessToken: session.accessToken!,
      cloudId: session.cloudId!,
      projectKey,
      site: session.site ?? process.env.NEXT_PUBLIC_JIRA_SITE ?? "https://farmatodovirtual.atlassian.net",
    });
    return NextResponse.json(result, {
      headers: {
        // Permite que React Query/Vercel sepan no cachear esta respuesta.
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("sprint fetch error:", e);
    return NextResponse.json(
      { error: "jira_fetch_failed", message: e?.message ?? "" },
      { status: 502 }
    );
  }
}
