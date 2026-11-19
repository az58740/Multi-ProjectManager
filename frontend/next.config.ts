import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    if (process.env.VERCEL) return [];
    const apiUpstream = process.env.API_UPSTREAM ?? "http://127.0.0.1:8080";
    return [
      { source: "/api/:path*", destination: `${apiUpstream}/api/:path*` },
      { source: "/_health", destination: `${apiUpstream}/_health` },
      { source: "/_ready", destination: `${apiUpstream}/_ready` },
    ];
  },
};

export default nextConfig;
