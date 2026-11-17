/**
 * Admin guard for server components under /admin.
 *
 * The admin layout is not an access boundary. On a client-side navigation the
 * browser tells the server which layouts it already has, and the server then
 * renders the page alone. A signed-in non-admin can send that request by hand,
 * so every /admin page calls this before it reads any data.
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth-utils";
import { ADMIN_HOME_PATH, buildAdminLoginUrl } from "@/lib/auth-routes";

/**
 * Sends anyone who is not an admin (no session, a social session, an expired
 * admin sign-in, a revoked role) to the admin sign-in. Uses the same judgement
 * as `requireAdmin()`. Wrapped in `cache` so the layout and the page share one
 * lookup per request.
 */
export const requireAdminPage = cache(async (): Promise<void> => {
  // No try/catch: a database failure must surface as an error, not as "not an admin".
  if (!(await getAdminSession())) {
    redirect(buildAdminLoginUrl(ADMIN_HOME_PATH));
  }
});
