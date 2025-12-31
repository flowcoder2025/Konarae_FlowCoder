import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>
            FlowMate에 로그인하여 시작하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            action={async () => {
              "use server";
              await signIn("kakao", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" className="w-full bg-[#FEE500] text-[#000000] hover:bg-[#FEE500]/90">
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C6.486 3 2 6.262 2 10.293c0 2.62 1.693 4.926 4.276 6.31-.176.64-.635 2.312-.72 2.68-.095.424.158.418.332.304.136-.088 2.18-1.462 3.092-2.072a13.56 13.56 0 0 0 3.02.344c5.514 0 10-3.262 10-7.293C22 6.262 17.514 3 12 3z"/>
              </svg>
              카카오톡으로 시작하기
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                또는
              </span>
            </div>
          </div>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google로 로그인
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground text-center">
            로그인 시{" "}
            <Link href="/terms" className="text-primary hover:underline">
              이용약관
            </Link>
            {" "}및{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              개인정보처리방침
            </Link>
            에 동의하게 됩니다.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            <Link href="/refund" className="hover:underline">
              환불약관
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
