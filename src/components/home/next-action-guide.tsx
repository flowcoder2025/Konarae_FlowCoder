import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileText,
  FileCheck,
  Clock,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

interface PendingTask {
  type: "company" | "diagnosis" | "plan" | "verify" | "deadline";
  projectId?: string;
  projectName?: string;
  description: string;
  urgency?: "high" | "medium" | "low";
  daysLeft?: number;
}

interface NextActionGuideProps {
  tasks: PendingTask[];
  hasCompany: boolean;
}

interface TaskConfig {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  buttonText: string;
  href?: string;
  hrefPrefix?: string;
}

const TASK_CONFIG: Record<PendingTask["type"], TaskConfig> = {
  company: {
    icon: Building2,
    color: "bg-blue-100 text-blue-600",
    buttonText: "기업 등록하기",
    href: "/company",
  },
  diagnosis: {
    icon: ClipboardCheck,
    color: "bg-yellow-100 text-yellow-600",
    buttonText: "진단 시작",
    hrefPrefix: "/my-projects/",
  },
  plan: {
    icon: FileText,
    color: "bg-purple-100 text-purple-600",
    buttonText: "계획서 작성",
    hrefPrefix: "/my-projects/",
  },
  verify: {
    icon: FileCheck,
    color: "bg-orange-100 text-orange-600",
    buttonText: "검증 시작",
    hrefPrefix: "/my-projects/",
  },
  deadline: {
    icon: Clock,
    color: "bg-red-100 text-red-600",
    buttonText: "바로가기",
    hrefPrefix: "/projects/",
  },
};

export function NextActionGuide({ tasks, hasCompany }: NextActionGuideProps) {
  // If no company, show company registration CTA
  if (!hasCompany) {
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">기업 정보를 등록하세요</h3>
                <p className="text-sm text-muted-foreground">
                  맞춤 지원사업 추천을 받으려면 기업 정보가 필요해요
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/company">
                시작하기
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no pending tasks
  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <FileCheck className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="font-semibold mb-1">모든 할 일을 완료했어요!</h3>
          <p className="text-sm text-muted-foreground mb-4">
            새로운 지원사업을 찾아보세요
          </p>
          <Button variant="outline" asChild>
            <Link href="/projects">지원사업 둘러보기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">다음 할 일</CardTitle>
          <Badge variant="secondary">{tasks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.slice(0, 3).map((task, index) => {
          const config = TASK_CONFIG[task.type];
          const Icon = config.icon;
          const href =
            task.type === "company"
              ? config.href
              : `${config.hrefPrefix}${task.projectId}`;

          return (
            <div
              key={index}
              className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${config.color}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {task.projectName || task.description}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {task.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {task.daysLeft !== undefined && task.daysLeft <= 7 && (
                  <Badge variant="destructive" className="shrink-0">
                    D-{task.daysLeft}
                  </Badge>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link href={href || "#"}>
                    {config.buttonText}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}

        {tasks.length > 3 && (
          <div className="text-center pt-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my-projects">
                {tasks.length - 3}개 더보기
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
