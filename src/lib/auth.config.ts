import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { LOGIN_PATH, resolveAuthRoute } from "./auth-routes";

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
      const decision = resolveAuthRoute({
        pathname: nextUrl.pathname,
        search: nextUrl.search,
        isLoggedIn: !!auth?.user,
      });

      if (decision.action === "redirect") {
        return Response.redirect(new URL(decision.location, nextUrl));
      }

      return true;
    },
  },
  pages: {
    signIn: LOGIN_PATH,
    error: LOGIN_PATH,
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days - 보안 강화: 세션 기간 단축
  },
};
