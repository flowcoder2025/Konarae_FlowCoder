/**
 * Shown to a signed-in user who is not an admin after they try to open /admin.
 * Lets them sign out and come back with another account.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { ADMIN_HOME_PATH, DEFAULT_AFTER_LOGIN, buildLoginUrl } from "@/lib/auth-routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ADMIN_LOGIN_URL = buildLoginUrl(ADMIN_HOME_PATH);
// After signing out here the user wants a different account, not the same one again.
const SWITCH_ACCOUNT_LOGIN_URL = buildLoginUrl(ADMIN_HOME_PATH, { switchAccount: true });

export const metadata: Metadata = {
  title: "관리자 권한 없음",
  robots: { index: false, follow: false },
};

export default async function AccessDeniedPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(ADMIN_LOGIN_URL);
  }

  // An admin has nothing to do here (for example after switching accounts).
  if (await isAdmin(userId)) {
    redirect(ADMIN_HOME_PATH);
  }

  const account = session.user?.email ?? session.user?.name ?? "현재 로그인한";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>관리자 계정이 아닙니다</h1>
          </CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{account}</span> 계정에는 관리자 권한이
            없습니다. 관리자 계정으로 다시 로그인해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: SWITCH_ACCOUNT_LOGIN_URL });
            }}
          >
            <Button type="submit" className="w-full">
              로그아웃 후 다른 계정으로 로그인
            </Button>
          </form>
          <Button asChild variant="outline" className="w-full">
            <Link href={DEFAULT_AFTER_LOGIN}>공고 목록으로 이동</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
