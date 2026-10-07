import { NextResponse, type NextRequest } from "next/server";

// Vérification optimiste : présence du cookie de session uniquement.
// La validation réelle (base de données) est faite dans les pages et actions serveur.
const SESSION_COOKIE = "synap_session";
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.svg|favicon.ico).*)"],
};
