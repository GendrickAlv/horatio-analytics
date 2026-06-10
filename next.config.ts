import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the production Docker image.
  output: "standalone",
  // The instrumentation hook needs the migration SQL files at runtime, but
  // Next.js's tracer can't follow a dynamic `migrationsFolder` string.
  // Explicitly include them so they end up under standalone/src/db/migrations.
  outputFileTracingIncludes: {
    "/*": ["./src/db/migrations/**/*"],
  },
};

export default nextConfig;
