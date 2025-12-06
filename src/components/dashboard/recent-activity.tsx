/**
 * Dashboard Recent Activity Component
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface RecentItem {
  id: string;
  title: string;
  subtitle?: string;
  score?: number;
  status?: string;
  createdAt: Date | string;
  href: string;
}

interface RecentActivityProps {
  title: string;
  items: RecentItem[];
  emptyMessage?: string;
  viewAllHref?: string;
}

export function RecentActivity({
  title,
  items,
  emptyMessage = "최근 활동이 없습니다",
  viewAllHref,
}: RecentActivityProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {viewAllHref && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={viewAllHref}>
              전체보기 <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block group hover:bg-accent rounded-lg p-3 -m-3 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </p>
                  </div>
                  {item.score !== undefined && (
                    <div className="ml-2 text-sm font-medium text-primary">
                      {item.score}점
                    </div>
                  )}
                  {item.status && (
                    <div className="ml-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : item.status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {item.status === "completed"
                          ? "완료"
                          : item.status === "in_progress"
                          ? "진행중"
                          : "대기"}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
