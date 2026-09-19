import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    globalNotFound: true,
  },
  reactStrictMode: true,
  transpilePackages: ["@lumina/api-client"],
};

export default nextConfig;
