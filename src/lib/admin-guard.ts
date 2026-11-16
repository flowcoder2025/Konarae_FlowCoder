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
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { DEFAULT_AFTER_LOGIN, buildLoginUrl } from "@/lib/auth-routes";

/**
 * Redirects anyone who is not an admin. Wrapped in `cache` so the layout and
 * the page share one lookup per request.
 */
export const requireAdminPage = cache(async (): Promise<void> => {
  // No try/catch: a database failure must surface as an error, not as "not an admin".
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(buildLoginUrl("/admin"));
  }

  if (!(await isAdmin(userId))) {
    redirect(DEFAULT_AFTER_LOGIN);
  }
});
