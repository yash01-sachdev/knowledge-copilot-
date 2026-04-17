import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
