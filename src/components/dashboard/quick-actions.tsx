/**
 * Dashboard Quick Actions Component
 */

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Building2, FileText, Search, CheckCircle } from "lucide-react";

export function QuickActions() {
  const actions = [
    {
      title: "새 기업 등록",
      description: "기업 정보를 등록하고 매칭을 시작하세요",
      icon: Building2,
      href: "/companies/new",
      variant: "default" as const,
    },
    {
      title: "지원사업 검색",
      description: "적합한 정부 지원사업을 찾아보세요",
      icon: Search,
      href: "/projects",
      variant: "outline" as const,
    },
    {
      title: "사업계획서 작성",
      description: "AI 기반으로 사업계획서를 작성하세요",
      icon: FileText,
      href: "/business-plans/new",
      variant: "outline" as const,
    },
    {
      title: "계획서 평가",
      description: "작성한 사업계획서를 평가받으세요",
      icon: CheckCircle,
      href: "/evaluations/new",
      variant: "outline" as const,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">빠른 작업</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((action) => (
            <Button
              key={action.href}
              variant={action.variant}
              className="h-auto flex-col items-start p-4 text-left"
              asChild
            >
              <Link href={action.href}>
                <div className="flex items-center gap-2 mb-2">
                  <action.icon className="h-5 w-5" />
                  <span className="font-semibold">{action.title}</span>
                </div>
                <p className="text-xs text-muted-foreground font-normal">
                  {action.description}
                </p>
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
