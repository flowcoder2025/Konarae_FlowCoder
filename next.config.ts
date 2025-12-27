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
      {
        source: "/matching",
        destination: "/my-projects",
        permanent: true,
      },
      {
        source: "/matching/:path*",
        destination: "/my-projects/:path*",
        permanent: true,
      },
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
