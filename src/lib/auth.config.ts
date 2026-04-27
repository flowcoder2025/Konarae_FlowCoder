import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";

/**
 * Edge-compatible auth configuration
 * Used by middleware (no Prisma/database adapter)
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const publicRoutes = ["/", "/projects", "/pricing", "/terms", "/privacy", "/refund", "/robots.txt", "/sitemap.xml"];
      const legacyPublicRedirects = [
        "/login",
        "/dashboard",
        "/home",
        "/company",
        "/companies",
        "/matching",
        "/business-plans",
        "/evaluations",
        "/diagnosis",
        "/my-projects",
        "/settings",
      ];
      const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
      const shouldRedirectLegacy = legacyPublicRedirects.some((route) => pathname === route || pathname.startsWith(`${route}/`));

      if (shouldRedirectLegacy && !pathname.startsWith("/admin")) {
        return Response.redirect(new URL("/projects", nextUrl));
      }

      if (isPublicRoute) {
        return true;
      }

      return isLoggedIn;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days - 보안 강화: 세션 기간 단축
  },
};
