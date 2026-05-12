import { NextResponse, type NextRequest } from "next/server";

// Sólo bloqueamos rutas de página: la lógica fina de sesión se hace en los
// route handlers (que necesitan acceder al cookie cifrado, no manejable aquí).
// Este middleware sólo es una guarda barata para evitar render del Dashboard
// sin sesión: redirige a /login cuando la cookie ni siquiera existe.
const COOKIE = process.env.SESSION_COOKIE_NAME ?? "sprint_armi_session";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has(COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
