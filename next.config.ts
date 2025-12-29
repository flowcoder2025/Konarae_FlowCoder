import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/companies",
        destination: "/company",
        permanent: true,
      },
      {
        source: "/companies/:path*",
        destination: "/company/:path*",
        permanent: true,
      },
      // /matching 메인 페이지만 리다이렉트, /matching/results, /matching/new 등은 유지
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
