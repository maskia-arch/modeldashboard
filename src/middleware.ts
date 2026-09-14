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

  // Allow static files, Next.js internal chunks, images, and user uploads
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/media") ||
    pathname.includes("/preview") ||
    pathname.startsWith("/uploads") ||
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

  // 2. Decode user role directly from JWT payload to prevent any UI flicker
  let userRole: string | null = null;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const json = atob(base64);
        const parsed = JSON.parse(json);
        userRole = parsed?.role || null;
      }
    } catch {}
  }

  // 3. If authenticated and visiting /login or /register, redirect into portal immediately
  if (token && (pathname === "/login" || pathname === "/register")) {
    const target = userRole === "INVESTOR" ? "/investor" : "/";
    return NextResponse.redirect(new URL(target, request.url));
  }

  // 4. Role-based isolation: If Investor visits Master routes, redirect immediately before rendering
  if (token && userRole === "INVESTOR") {
    // Root path is Master Dashboard -> Investor must be at /investor
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/investor", request.url));
    }
    // Protected Master Admin routes
    if (
      pathname === "/models" ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/schedule")
    ) {
      return NextResponse.redirect(new URL("/investor", request.url));
    }
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
