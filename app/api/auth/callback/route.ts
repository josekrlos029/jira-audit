import { NextResponse } from "next/server";
import {
  exchangeCode,
  getAccessibleResources,
  getCurrentUser,
} from "@/lib/atlassian-oauth";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  if (errParam) {
    return redirectWithError(`Atlassian devolvió un error: ${errParam}`);
  }
  if (!code || !state) {
    return redirectWithError("Faltan parámetros de OAuth (code/state).");
  }

  const session = await getSession();
  if (!session.oauthState || session.oauthState !== state) {
    return redirectWithError("State inválido. Reinicia el flujo de login.");
  }
  delete session.oauthState;

  try {
    const tok = await exchangeCode(code);
    session.accessToken = tok.access_token;
    session.refreshToken = tok.refresh_token;
    session.expiresAt = Date.now() + tok.expires_in * 1000;

    // Resolvemos el cloudId del site al que tenemos acceso.
    const resources = await getAccessibleResources(tok.access_token);
    const wantedSite = process.env.NEXT_PUBLIC_JIRA_SITE?.replace(/\/$/, "");
    const match =
      (wantedSite && resources.find((r) => r.url.replace(/\/$/, "") === wantedSite)) ||
      resources[0];

    if (!match) {
      return redirectWithError(
        "Tu cuenta no tiene acceso a ningún site de Jira. Verifica permisos."
      );
    }

    session.cloudId = match.id;
    session.site = match.url;

    const me = await getCurrentUser(tok.access_token);
    session.user = {
      accountId: me.account_id,
      displayName: me.name ?? me.email ?? "Usuario",
      email: me.email,
      avatar: me.picture,
    };

    await session.save();
    return NextResponse.redirect(absoluteUrl("/"));
  } catch (e: any) {
    console.error("OAuth callback error:", e);
    return redirectWithError(e?.message ?? "Error inesperado en el callback.");
  }
}

function redirectWithError(msg: string) {
  const u = new URL(absoluteUrl("/login"));
  u.searchParams.set("error", msg);
  return NextResponse.redirect(u.toString());
}

function absoluteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
