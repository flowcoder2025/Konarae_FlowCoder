import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import { authorizeAdmin } from "./admin-login/authorize";
import { ADMIN_CREDENTIALS_ID } from "./admin-login/constants";

/**
 * Full auth configuration with Prisma adapter
 * Used by server-side routes (not Edge compatible)
 *
 * The admin email + password provider lives here, not in `auth.config.ts`:
 * it needs Prisma and node:crypto, which the Edge middleware cannot load.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: ADMIN_CREDENTIALS_ID,
      credentials: { email: {}, password: {} },
      authorize: authorizeAdmin,
    }),
  ],
  adapter: PrismaAdapter(prisma),
});
