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
      <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-4">
        <CardTitle className="text-sm sm:text-base font-semibold">빠른 작업</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {actions.map((action) => (
            <Button
              key={action.href}
              variant={action.variant}
              rounded="lg"
              className="h-auto flex-col items-start p-3 sm:p-4 text-left"
              asChild
            >
              <Link href={action.href}>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                  <action.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="font-semibold text-xs sm:text-sm">{action.title}</span>
                </div>
                <p
                  className={`text-xs font-normal hidden sm:block ${
                    action.variant === "default"
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
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
