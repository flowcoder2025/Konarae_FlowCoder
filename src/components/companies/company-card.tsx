"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Users, FileText, Target } from "lucide-react";

interface CompanyCardProps {
  company: {
    id: string;
    name: string;
    businessNumber: string;
    representativeName: string;
    role: string;
    _count: {
      members: number;
      businessPlans: number;
      matchingResults: number;
    };
  };
}

const ROLE_LABELS: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
  viewer: "outline",
};

export function CompanyCard({ company }: CompanyCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">{company.name}</CardTitle>
              <CardDescription className="mt-1">
                대표: {company.representativeName}
              </CardDescription>
            </div>
          </div>
          <Badge variant={ROLE_VARIANTS[company.role]}>
            {ROLE_LABELS[company.role]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{company._count.members}명</span>
            </div>
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              <span>{company._count.businessPlans}개</span>
            </div>
            <div className="flex items-center gap-1">
              <Target className="h-4 w-4" />
              <span>{company._count.matchingResults}개</span>
            </div>
          </div>
          <Link href={`/companies/${company.id}`}>
            <Button variant="outline" className="w-full">
              상세 보기
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
