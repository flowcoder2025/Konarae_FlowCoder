import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EvaluationCard } from "@/components/evaluations/evaluation-card";

export default async function EvaluationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const evaluations = await prisma.evaluation.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      businessPlan: {
        select: {
          id: true,
          title: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          feedbacks: true,
        },
      },
    },
  });

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">사업계획서 평가</h1>
          <p className="text-muted-foreground">
            AI 기반 사업계획서 평가 및 피드백을 확인합니다
          </p>
        </div>
        <Link href="/evaluations/new">
          <Button>새 평가 요청</Button>
        </Link>
      </div>

      {evaluations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            아직 평가한 사업계획서가 없습니다
          </p>
          <Link href="/evaluations/new">
            <Button>첫 평가 시작하기</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {evaluations.map((evaluation) => (
            <EvaluationCard key={evaluation.id} evaluation={evaluation} />
          ))}
        </div>
      )}
    </div>
  );
}
