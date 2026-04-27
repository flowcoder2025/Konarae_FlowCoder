import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mate.flow-coder.com";

const DISALLOWED_PATHS = [
  "/api",
  "/admin",
  "/_next",
  "/private",
  "/login",
  "/dashboard",
  "/home",
  "/settings",
  "/matching",
  "/business-plans",
  "/company",
  "/companies",
  "/my-projects",
  "/evaluations",
  "/diagnosis",
  "/pipeline",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      {
        userAgent: "Claude-Web",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
