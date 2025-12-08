import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CompanyCard } from "@/components/companies/company-card";
import { Plus } from "lucide-react";

async function getCompanies(userId: string) {
  const response = await fetch(`${process.env.NEXTAUTH_URL}/api/companies`, {
    headers: {
      Cookie: `next-auth.session-token=${userId}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  return response.json();
}

export default async function CompaniesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // For server component, we'll use direct Prisma call
  const { prisma } = await import("@/lib/prisma");

  const companies = await prisma.company.findMany({
    where: {
      members: {
        some: {
          userId: session.user.id,
        },
      },
      deletedAt: null,
    },
    include: {
      members: {
        where: {
          userId: session.user.id,
        },
        select: {
          role: true,
        },
      },
      _count: {
        select: {
          members: true,
          businessPlans: true,
          matchingResults: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const companiesWithRole = companies.map((company) => ({
    ...company,
    role: company.members[0]?.role || "viewer",
  }));

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">기업 관리</h1>
          <p className="text-muted-foreground mt-2">
            등록된 기업을 관리하고 새로운 기업을 추가하세요
          </p>
        </div>
        <Link href="/companies/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            기업 등록
          </Button>
        </Link>
      </div>

      {companiesWithRole.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 bg-muted rounded-full mb-4">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">등록된 기업이 없습니다</h3>
          <p className="text-muted-foreground mb-4">
            첫 번째 기업을 등록하여 시작하세요
          </p>
          <Link href="/companies/new">
            <Button>기업 등록하기</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {companiesWithRole.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
