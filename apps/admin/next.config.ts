import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@algo-attendance/shared"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false
      };
    }

    return config;
  }
};

export default nextConfig;
