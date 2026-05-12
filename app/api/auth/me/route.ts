import { NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!isSessionValid(s)) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({
    authenticated: true,
    user: s.user ?? null,
    site: s.site ?? null,
    cloudId: s.cloudId ?? null,
  });
}
