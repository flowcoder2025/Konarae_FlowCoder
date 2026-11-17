/**
 * Admin password login constants.
 *
 * Imported by the Edge auth config (middleware bundle), so this module must
 * stay free of imports.
 */

/** Auth.js provider id of the admin email + password sign-in. */
export const ADMIN_CREDENTIALS_ID = "admin-credentials";

/** How long an admin password sign-in grants admin access. */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
