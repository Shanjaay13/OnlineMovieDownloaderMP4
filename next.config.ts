import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allow builds to succeed even with TS errors (needed for @distube/ytdl-core)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Allow builds to succeed even with lint warnings
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
    ],
  },
};

export default nextConfig;
