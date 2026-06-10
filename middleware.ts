import { NextResponse } from "next/server";

// Production-only CSP. Dev mode is excluded because Next.js + Turbopack
// rely on eval/inline injection for HMR; turning CSP on there breaks the
// dev loop without buying anything (dev is never internet-facing).
// The policy itself locks scripts and styles to same-origin (plus the
// minimum inline allowances Next.js's hydration needs in production),
// blocks framing entirely, and pins data:/blob: to images and fonts.
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Defence-in-depth headers for every response. Most of these matter when the
// API or dashboard is reachable from a browser; we set them unconditionally
// so a misconfigured deployment doesn't accidentally drop the protection.
export function middleware(): NextResponse {
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS + CSP only behind HTTPS / production — both would brick a plain-HTTP
  // local run or the dev HMR loop respectively.
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    response.headers.set("Content-Security-Policy", PRODUCTION_CSP);
  }
  return response;
}

// Apply to every route. The matcher excludes Next.js internals so we don't
// rewrite headers on framework assets.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
