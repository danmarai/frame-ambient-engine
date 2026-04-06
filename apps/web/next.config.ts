import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "better-sqlite3",
    "node-cron",
    "samsung-frame-connect",
    "node-ssdp",
    "sharp",
    "ws",
  ],
  transpilePackages: [
    "@frame/core",
    "@frame/config",
    "@frame/db",
    "@frame/providers",
    "@frame/rendering",
    "@frame/tv",
    "@frame/health",
  ],
};

export default nextConfig;
