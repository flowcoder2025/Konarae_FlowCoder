"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, FileText, Clock } from "lucide-react";

interface DocumentStatsCardsProps {
  totalDocuments: number;
  analyzedDocuments: number;
  pendingDocuments: number;
  recentUploadDate?: string | null;
}

export function DocumentStatsCards({
  totalDocuments,
  analyzedDocuments,
  pendingDocuments,
  recentUploadDate,
}: DocumentStatsCardsProps) {
  const stats = [
    {
      label: "전체 서류",
      value: totalDocuments,
      icon: FileText,
      color: "bg-blue-100 text-blue-600",
    },
    {
      label: "분석 완료",
      value: analyzedDocuments,
      icon: CheckCircle2,
      color: "bg-green-100 text-green-600",
    },
    {
      label: "분석 대기",
      value: pendingDocuments,
      icon: AlertCircle,
      color: "bg-yellow-100 text-yellow-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label}>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${stat.color} flex items-center justify-center`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
