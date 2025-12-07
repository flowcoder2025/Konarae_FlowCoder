/**
 * Admin User Management Page
 * Manage users and roles
 */

import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, User, Mail } from "lucide-react";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      _count: {
        select: {
          companies: true,
          businessPlans: true,
        },
      },
    },
  });

  // TODO: Enable after migration is applied
  // const stats = await prisma.user.groupBy({
  //   by: ["role"],
  //   _count: true,
  // });
  const roleCounts = { admin: 0, user: users.length };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">사용자 관리</h1>
        <p className="mt-2 text-muted-foreground">
          사용자 계정과 권한을 관리합니다
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">관리자</div>
          <div className="text-2xl font-bold">{roleCounts.admin || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">일반 사용자</div>
          <div className="text-2xl font-bold">{roleCounts.user || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">전체</div>
          <div className="text-2xl font-bold">
            {Object.values(roleCounts).reduce((a, b) => a + b, 0)}
          </div>
        </Card>
      </div>

      {/* Users List */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-medium">사용자</th>
                <th className="p-4 text-left font-medium">이메일</th>
                <th className="p-4 text-left font-medium">권한</th>
                <th className="p-4 text-left font-medium">인증</th>
                <th className="p-4 text-center font-medium">기업/계획서</th>
                <th className="p-4 text-left font-medium">가입일</th>
                <th className="p-4 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{user.name || "이름 없음"}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="p-4">
                    <Badge variant="outline">
                      사용자
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge variant={user.emailVerified ? "default" : "secondary"}>
                      {user.emailVerified ? (
                        <>
                          <Mail className="mr-1 h-3 w-3" />
                          인증됨
                        </>
                      ) : (
                        "미인증"
                      )}
                    </Badge>
                  </td>
                  <td className="p-4 text-center text-sm text-muted-foreground">
                    {user._count.companies} / {user._count.businessPlans}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline">
                        권한 변경
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              등록된 사용자가 없습니다
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
