/**
 * Admin sign-in (email + password). Admin access needs this sign-in; a Kakao
 * or Google session never counts, whatever its role.
 *
 * The form renders for everyone who is not already a password admin, also
 * over a social session: sending that session elsewhere would bring it back
 * here through the /admin guard.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth-utils";
import { ADMIN_HOME_PATH, sanitizeCallbackUrl } from "@/lib/auth-routes";
import { submitAdminLogin } from "@/lib/admin-login/submit";
import { ADMIN_LOGIN_TEXT } from "@/lib/text-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = {
  title: ADMIN_LOGIN_TEXT.title,
  robots: { index: false, follow: false },
};

interface AdminLoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const EMAIL_ID = "admin-login-email";
const PASSWORD_ID = "admin-login-password";
const ERROR_ID = "admin-login-error";

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = await searchParams;
  const callback = sanitizeCallbackUrl(params.callbackUrl, ADMIN_HOME_PATH);

  if (await getAdminSession()) {
    redirect(callback);
  }

  const hasError = params.error === "1";
  const errorProps = hasError
    ? { "aria-invalid": true as const, "aria-describedby": ERROR_ID }
    : {};

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>{ADMIN_LOGIN_TEXT.title}</h1>
          </CardTitle>
          <CardDescription>{ADMIN_LOGIN_TEXT.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            action={async (formData: FormData) => {
              "use server";
              // The callback is the server's sanitized value from this render,
              // never a field of the submitted form.
              await submitAdminLogin(formData, callback);
            }}
          >
            {hasError && (
              <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
                {ADMIN_LOGIN_TEXT.error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor={EMAIL_ID}>{ADMIN_LOGIN_TEXT.emailLabel}</Label>
              <Input
                id={EMAIL_ID}
                name="email"
                type="email"
                autoComplete="username"
                required
                {...errorProps}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={PASSWORD_ID}>{ADMIN_LOGIN_TEXT.passwordLabel}</Label>
              <Input
                id={PASSWORD_ID}
                name="password"
                type="password"
                autoComplete="current-password"
                required
                {...errorProps}
              />
            </div>
            <Button type="submit" className="w-full">
              {ADMIN_LOGIN_TEXT.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
