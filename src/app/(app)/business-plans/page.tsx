import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BusinessPlanCard } from "@/components/business-plans/business-plan-card";

export default async function BusinessPlansPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const businessPlans = await prisma.businessPlan.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          organization: true,
          sourceUrl: true,
        },
      },
      _count: {
        select: {
          sections: true,
        },
      },
    },
  });

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">사업계획서</h1>
          <p className="text-muted-foreground">
            AI 기반 사업계획서를 작성하고 관리합니다
          </p>
        </div>
        <Link href="/business-plans/new">
          <Button>새 사업계획서 작성</Button>
        </Link>
      </div>

      {businessPlans.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            아직 작성한 사업계획서가 없습니다
          </p>
          <Link href="/business-plans/new">
            <Button>첫 사업계획서 작성하기</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {businessPlans.map((plan) => (
            <BusinessPlanCard key={plan.id} businessPlan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
