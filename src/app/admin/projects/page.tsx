/**
 * Admin Project Management Page
 * Manage support projects
 */

import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Eye, Edit, Trash2 } from "lucide-react";

export default async function AdminProjectsPage() {
  const [projects, stats] = await Promise.all([
    prisma.supportProject.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        organization: true,
        category: true,
        status: true,
        deadline: true,
        isPermanent: true,
        viewCount: true,
        bookmarkCount: true,
        createdAt: true,
      },
    }),
    prisma.supportProject.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const statusCounts = stats.reduce((acc, { status, _count }) => {
    acc[status] = _count;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">프로젝트 관리</h1>
        <p className="mt-2 text-muted-foreground">
          지원사업 프로젝트를 관리하고 모니터링합니다
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">활성</div>
          <div className="text-2xl font-bold">{statusCounts.active || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">마감</div>
          <div className="text-2xl font-bold">{statusCounts.closed || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">초안</div>
          <div className="text-2xl font-bold">{statusCounts.draft || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">전체</div>
          <div className="text-2xl font-bold">
            {Object.values(statusCounts).reduce((a, b) => a + b, 0)}
          </div>
        </Card>
      </div>

      {/* Projects List */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-medium">프로젝트명</th>
                <th className="p-4 text-left font-medium">기관</th>
                <th className="p-4 text-left font-medium">카테고리</th>
                <th className="p-4 text-left font-medium">상태</th>
                <th className="p-4 text-left font-medium">마감일</th>
                <th className="p-4 text-center font-medium">조회/북마크</th>
                <th className="p-4 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="p-4 font-medium">{project.name}</td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {project.organization}
                  </td>
                  <td className="p-4">
                    <Badge variant="outline">{project.category}</Badge>
                  </td>
                  <td className="p-4">
                    <Badge
                      variant={
                        project.status === "active"
                          ? "default"
                          : project.status === "closed"
                          ? "outline"
                          : "secondary"
                      }
                    >
                      {project.status === "active" && "활성"}
                      {project.status === "closed" && "마감"}
                      {project.status === "draft" && "초안"}
                    </Badge>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {project.isPermanent
                      ? "상시모집"
                      : project.deadline
                      ? new Date(project.deadline).toLocaleDateString("ko-KR")
                      : "-"}
                  </td>
                  <td className="p-4 text-center text-sm text-muted-foreground">
                    {project.viewCount} / {project.bookmarkCount}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {projects.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              등록된 프로젝트가 없습니다
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
