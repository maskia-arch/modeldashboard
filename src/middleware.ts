import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that unauthenticated visitors are allowed to access
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/health",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files, Next.js internal chunks, and images
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.includes(".") // favicon.ico, images, etc.
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  const token = request.cookies.get("auth_token")?.value;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  // 1. If not authenticated and attempting to access a protected page
  if (!token && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 2. If authenticated and visiting /login or /register, redirect into portal
  if (token && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
