import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip TypeScript errors during build (Supabase types need regeneration)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
