/**
 * Dashboard Deadline Alert Component
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";

interface DeadlineItem {
  id: string;
  title: string;
  agency: string;
  deadline: Date | string;
  budget?: bigint | number | null;
  daysLeft: number;
}

interface DeadlineAlertProps {
  deadlines: DeadlineItem[];
}

export function DeadlineAlert({ deadlines }: DeadlineAlertProps) {
  if (deadlines.length === 0) {
    return null;
  }

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-600" />
          마감 임박 지원사업
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="space-y-2 sm:space-y-3">
          {deadlines.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-2 p-2.5 sm:p-3 bg-white rounded-lg border"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-start sm:items-center gap-2 mb-1 flex-col sm:flex-row">
                  <p className="text-xs sm:text-sm font-medium line-clamp-2 sm:truncate">{item.title}</p>
                  <Badge
                    variant={item.daysLeft <= 7 ? "destructive" : "secondary"}
                    className="shrink-0 text-xs"
                  >
                    D-{item.daysLeft}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.agency}</p>
                <p className="text-xs text-muted-foreground mt-0.5 sm:mt-1">
                  마감일:{" "}
                  {format(new Date(item.deadline), "yyyy년 M월 d일", {
                    locale: ko,
                  })}
                </p>
                {item.budget && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    예산: {Number(item.budget).toLocaleString()}원
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0 text-xs sm:text-sm h-7 sm:h-8 px-2 sm:px-3">
                <Link href={`/projects/${item.id}`}>
                  상세보기 <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
