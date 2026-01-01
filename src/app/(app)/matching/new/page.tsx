import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { MatchingExecutor } from "@/components/matching/matching-executor";

interface MatchingNewPageProps {
  searchParams: Promise<{ companyId?: string }>;
}

export default async function MatchingNewPage({
  searchParams,
}: MatchingNewPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const companyId = params.companyId;

  // No company selected
  if (!companyId) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-semibold mb-2">기업을 선택해주세요</h2>
          <p className="text-muted-foreground mb-4">
            매칭을 실행하려면 기업을 먼저 선택해야 합니다.
          </p>
          <Link href="/matching">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              매칭 대시보드로 돌아가기
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // 서버에서 직접 기업 정보 페칭 (API 호출 없이)
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      members: { some: { userId: session.user.id } },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!company) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/matching"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          매칭 대시보드
        </Link>
        <h1 className="text-3xl font-bold mb-2">{company.name} 매칭 실행</h1>
        <p className="text-muted-foreground">
          기업 정보를 기반으로 적합한 지원사업을 찾습니다
        </p>
      </div>

      {/* Client Component for Interactive Matching */}
      <MatchingExecutor companyId={company.id} companyName={company.name} />
    </div>
  );
}
