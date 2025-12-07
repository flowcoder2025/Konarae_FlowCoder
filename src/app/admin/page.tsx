/**
 * Admin Dashboard Page
 * Overview statistics and quick access
 */

import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Users, FileText, Database, Activity } from "lucide-react";
import Link from "next/link";

export default async function AdminDashboardPage() {
  // Fetch statistics
  const [userCount, projectCount, crawlJobCount, activeCompanyCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.supportProject.count(),
      prisma.crawlJob.count(),
      prisma.company.count({ where: { deletedAt: null } }),
    ]);

  const stats = [
    {
      label: "총 사용자",
      value: userCount,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "등록된 프로젝트",
      value: projectCount,
      icon: FileText,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      label: "활성 기업",
      value: activeCompanyCount,
      icon: Activity,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      label: "크롤링 작업",
      value: crawlJobCount,
      icon: Database,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">관리자 대시보드</h1>
        <p className="mt-2 text-muted-foreground">
          시스템 전체 현황을 확인하고 관리할 수 있습니다
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                </div>
                <div className={`rounded-full p-3 ${stat.bgColor}`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold">빠른 작업</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Link href="/admin/crawler">
            <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
              <Database className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold">크롤러 시작</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                새로운 크롤링 작업을 시작합니다
              </p>
            </Card>
          </Link>

          <Link href="/admin/projects">
            <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
              <FileText className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold">프로젝트 승인</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                대기 중인 프로젝트를 검토하고 승인합니다
              </p>
            </Card>
          </Link>

          <Link href="/admin/users">
            <Card className="p-6 hover:border-primary transition-colors cursor-pointer">
              <Users className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold">사용자 관리</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                사용자 계정을 관리하고 권한을 설정합니다
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
