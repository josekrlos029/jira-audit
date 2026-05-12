import "server-only";
import type { SessionData } from "./types";

/**
 * Atlassian OAuth 2.0 (3LO) helpers.
 *
 * Docs:
 *   https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
 *
 * Flujo:
 *   1. GET  /api/auth/login       -> redirect a auth.atlassian.com/authorize
 *   2. GET  /api/auth/callback    -> intercambia el `code` por access/refresh tokens
 *   3. Llamadas API usan:          GET https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...
 */

export const SCOPES = [
  // Jira API
  "read:jira-work",
  "read:jira-user",
  // User identity API — necesario para GET https://api.atlassian.com/me
  // (sin este scope el /me devuelve 403 forbidden.insufficientScope).
  "read:me",
  // Necesario para refresh tokens
  //"offline_access",
] as const;

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: must("ATLASSIAN_CLIENT_ID"),
    scope: SCOPES.join(" "),
    redirect_uri: redirectUri(),
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/callback`;
}

interface TokenResp {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCode(code: string): Promise<TokenResp> {
  const r = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: must("ATLASSIAN_CLIENT_ID"),
      client_secret: must("ATLASSIAN_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri(),
    }),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`Token exchange falló: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

export async function refreshTokens(refreshToken: string): Promise<TokenResp> {
  const r = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: must("ATLASSIAN_CLIENT_ID"),
      client_secret: must("ATLASSIAN_CLIENT_SECRET"),
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`Refresh token falló: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

export interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl: string;
}

export async function getAccessibleResources(
  accessToken: string
): Promise<AccessibleResource[]> {
  const r = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`accessible-resources falló: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

export interface AtlassianMe {
  account_id: string;
  email?: string;
  name?: string;
  picture?: string;
}

export async function getCurrentUser(accessToken: string): Promise<AtlassianMe> {
  const r = await fetch("https://api.atlassian.com/me", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`/me falló: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

/**
 * Asegura que la sesión tiene un access token vigente.
 * Si está vencido, lo refresca y persiste en `session`.
 * El caller debe llamar `await session.save()` después si hubo cambios.
 */
export async function ensureFreshToken(session: SessionData): Promise<boolean> {
  if (!session.accessToken || !session.expiresAt) return false;
  const expSafe = session.expiresAt - 60_000; // refrescar 1min antes
  if (Date.now() < expSafe) return true;
  if (!session.refreshToken) return false;
  try {
    const t = await refreshTokens(session.refreshToken);
    session.accessToken = t.access_token;
    if (t.refresh_token) session.refreshToken = t.refresh_token;
    session.expiresAt = Date.now() + t.expires_in * 1000;
    return true;
  } catch (e) {
    console.error("Refresh token error:", e);
    return false;
  }
}

function must(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Falta variable de entorno ${name}. Revisa tu .env.local — guíate por .env.local.example.`
    );
  }
  return v;
}
