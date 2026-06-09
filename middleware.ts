import { NextResponse } from "next/server";

// Defence-in-depth headers for every response. Most of these matter when the
// API or dashboard is reachable from a browser; we set them unconditionally
// so a misconfigured deployment doesn't accidentally drop the protection.
export function middleware(): NextResponse {
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS only behind HTTPS — would brick a plain-HTTP local run if always on.
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

// Apply to every route. The matcher excludes Next.js internals so we don't
// rewrite headers on framework assets.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
