/**
 * Form submission for the admin sign-in page (Node runtime only).
 *
 * A plain server module on purpose: never add a "use server" directive here.
 * Every export of such a module becomes an endpoint the client can call with
 * any arguments, and `redirectTo` must come from the page, not the client.
 * The page wraps this in an inline server action that closes over its own
 * sanitized callback.
 */

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { ADMIN_HOME_PATH, buildAdminLoginUrl, sanitizeCallbackUrl } from "@/lib/auth-routes";
import { ADMIN_CREDENTIALS_ID } from "./constants";

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The sign-in page again, with the failure flag and the same callback. */
export function buildAdminLoginErrorUrl(callbackPath: string): string {
  return `${buildAdminLoginUrl(callbackPath)}&error=1`;
}

/**
 * Signs in with the email and password from the form and returns to
 * `redirectTo`. Any Auth.js error (wrong credentials, a lock, a failing
 * database inside `authorize`) sends the user back to the form with one
 * generic flag. Everything else, including the NEXT_REDIRECT that a
 * successful sign-in throws, propagates unchanged.
 */
export async function submitAdminLogin(formData: FormData, redirectTo: string): Promise<void> {
  const callback = sanitizeCallbackUrl(redirectTo, ADMIN_HOME_PATH);
  const email = textField(formData, "email");
  const password = textField(formData, "password");

  try {
    await signIn(ADMIN_CREDENTIALS_ID, { email, password, redirectTo: callback });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(buildAdminLoginErrorUrl(callback));
    }
    throw error;
  }
}
