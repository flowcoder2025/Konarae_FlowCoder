import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary/10 to-background">
      <div className="container flex max-w-4xl flex-col items-center gap-8 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          FlowMate
        </h1>
        <p className="text-xl text-muted-foreground">
          당신의 업무 흐름을 함께하는 AI 파트너
        </p>
        <p className="max-w-2xl text-muted-foreground">
          중소기업과 스타트업이 적합한 지원사업을 찾고 AI 기반 사업계획서를 작성할 수 있도록 지원합니다.
        </p>
        <div className="flex gap-4">
          <Link href="/login">
            <Button size="lg">시작하기</Button>
          </Link>
          <Link href="/pricing">
            <Button variant="outline" size="lg">
              요금제 보기
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
