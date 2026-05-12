import "server-only";
import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "./types";

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  // En dev arrojamos un warning en consola; en prod la app explota al usar la sesión.
  console.warn(
    "[sprint-armi] SESSION_SECRET no está definido o es menor a 32 chars. " +
      "Genera uno con: openssl rand -base64 48"
  );
}

export const sessionOptions: SessionOptions = {
  password: password ?? "_placeholder_secret_change_me_in_env_local_______",
  cookieName: process.env.SESSION_COOKIE_NAME ?? "sprint_armi_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días — el refresh token aguanta.
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

export function isSessionValid(s: SessionData): s is Required<
  Pick<SessionData, "accessToken" | "expiresAt" | "cloudId">
> &
  SessionData {
  return Boolean(s.accessToken && s.expiresAt && s.cloudId);
}
