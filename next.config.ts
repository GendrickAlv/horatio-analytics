import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the production Docker image.
  output: "standalone",
};

export default nextConfig;
