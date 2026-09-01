import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Protects every app route. Unauthenticated requests are redirected to /login
 * with a callbackUrl; agency users are kept out of vendor-only surfaces and
 * vice versa. This is convenience routing — the real boundary is
 * `getAuthorizedProject` in every server action and route handler.
 */
export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  const isPublic =
    path === "/login" ||
    path.startsWith("/api/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  if (isPublic) {
    if (path === "/login" && session) {
      const home = session.user.orgType === "AGENCY" ? "/portfolio" : "/";
      return NextResponse.redirect(new URL(home, nextUrl));
    }
    return NextResponse.next();
  }

  if (!session) {
    const login = new URL("/login", nextUrl);
    if (path !== "/") login.searchParams.set("callbackUrl", path + nextUrl.search);
    return NextResponse.redirect(login);
  }

  const isAgency = session.user.orgType === "AGENCY";
  if (path.startsWith("/portfolio") && !isAgency) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }
  if (path === "/" && isAgency) {
    return NextResponse.redirect(new URL("/portfolio", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
