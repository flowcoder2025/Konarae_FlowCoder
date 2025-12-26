/**
 * Admin Layout
 * Layout with sidebar navigation for admin pages
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-utils";
import {
  LayoutDashboard,
  Database,
  FileText,
  Users,
  Coins,
  Target,
} from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }

  const navItems = [
    {
      name: "대시보드",
      href: "/admin",
      icon: LayoutDashboard,
    },
    {
      name: "크롤러 관리",
      href: "/admin/crawler",
      icon: Database,
    },
    {
      name: "프로젝트 관리",
      href: "/admin/projects",
      icon: FileText,
    },
    {
      name: "사용자 관리",
      href: "/admin/users",
      icon: Users,
    },
    {
      name: "크래딧 관리",
      href: "/admin/credits",
      icon: Coins,
    },
    {
      name: "매칭 현황",
      href: "/admin/matching",
      icon: Target,
    },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b p-6">
            <h2 className="text-lg font-semibold">관리자 패널</h2>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              ← 대시보드로 돌아가기
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
