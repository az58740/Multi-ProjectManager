import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  // Vercel's multiservice routing does not expose Next's image optimizer route;
  // serve the committed public images directly instead.
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
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
