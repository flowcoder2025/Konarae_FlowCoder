import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { LOGIN_PATH, resolveAuthRoute } from "./auth-routes";
import { ADMIN_CREDENTIALS_ID } from "./admin-login/constants";

/**
 * Edge-compatible auth configuration
 * Used by middleware (no Prisma/database adapter)
 *
 * The admin credentials provider is added in `auth.ts` only; keep it (and
 * anything that imports Prisma or node:crypto) out of this file.
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
    // Never read the `session` argument here: on `trigger: "update"` it is
    // whatever the client posted to /api/auth/session.
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id;
      }

      // `adminAuthAt` marks an admin password sign-in. Only a sign-in through
      // the admin credentials provider sets it; any other sign-in clears it.
      if (trigger === "signIn" || trigger === "signUp") {
        if (account?.provider === ADMIN_CREDENTIALS_ID && account.type === "credentials") {
          token.adminAuthAt = Date.now();
        } else {
          delete token.adminAuthAt;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      const adminAuthAt: unknown = token.adminAuthAt;
      if (typeof adminAuthAt === "number" && Number.isFinite(adminAuthAt)) {
        session.adminAuthAt = adminAuthAt;
      } else {
        delete session.adminAuthAt;
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
