import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import { authorizeAdmin } from "./admin-login/authorize";
import { ADMIN_CREDENTIALS_ID } from "./admin-login/constants";
import { createLogger } from "./logger";

const authLog = createLogger({ lib: "auth" });

/**
 * Auth.js error logger. @auth/core 0.41.0 calls `logger.error(error)` with the
 * thrown error only (index.js L122).
 *
 * - `CredentialsSignin` (`authorize` returned null: wrong password, throttled,
 *   misconfigured; `authorizeAdmin` has already logged the reason) is expected
 *   traffic, so one warn line without the stack or anything from the request.
 *   Matched on `type`, which comes from the class's static `type`
 *   (errors.js L26, L172): `name` is `constructor.name` (L24), which a
 *   minifier may rename, and `instanceof` depends on which @auth/core copy
 *   was loaded.
 * - Every other error goes to `console.error` unchanged.
 *
 * Only `error` is set. Never add `debug` (or a logger with one) here: setLogger
 * installs `config.logger.debug` over the no-op that `debug: false` sets
 * (lib/utils/logger.js), which would bring back the request-body log.
 */
const authLogger: NextAuthConfig["logger"] = {
  error(error) {
    if ((error as { type?: unknown } | null)?.type === "CredentialsSignin") {
      authLog.warn("Auth.js sign-in rejected", { type: "CredentialsSignin" });
      return;
    }
    console.error(error);
  },
};

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
  // Keep off, after the spread so nothing above can turn it on: at debug level
  // @auth/core logs the credentials request body, admin password included,
  // when authorize throws (0.41.0 lib/actions/callback/index.js L389).
  debug: false,
  logger: authLogger,
});
