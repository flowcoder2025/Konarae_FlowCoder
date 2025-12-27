"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  MapPin,
  Calendar,
  User,
  Briefcase,
  Hash,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface CompanyProfileCardProps {
  company: {
    name: string;
    registrationNumber: string | null;
    industry: string | null;
    size: string | null;
    address: string | null;
    representativeName: string | null;
    foundedAt: string | null;
  };
  completionPercentage?: number;
}

const PROFILE_FIELDS = [
  { key: "registrationNumber", label: "사업자등록번호", icon: Hash },
  { key: "industry", label: "업종", icon: Briefcase },
  { key: "size", label: "기업 규모", icon: Building2 },
  { key: "representativeName", label: "대표자명", icon: User },
  { key: "address", label: "주소", icon: MapPin },
  { key: "foundedAt", label: "설립일", icon: Calendar },
];

export function CompanyProfileCard({ company, completionPercentage }: CompanyProfileCardProps) {
  const filledFields = PROFILE_FIELDS.filter(
    (f) => company[f.key as keyof typeof company]
  ).length;
  const completion = completionPercentage ?? Math.round((filledFields / PROFILE_FIELDS.length) * 100);
  const isComplete = completion >= 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>기본 정보</CardTitle>
            <CardDescription>
              지원사업 매칭에 사용되는 기업 정보입니다
            </CardDescription>
          </div>
          <Badge
            variant={isComplete ? "default" : "outline"}
            className={isComplete ? "bg-green-600" : ""}
          >
            {isComplete ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                완성
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                {completion}% 완료
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Bar */}
        {!isComplete && (
          <div className="mb-6">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {PROFILE_FIELDS.length - filledFields}개 항목을 더 입력하면 매칭 정확도가 높아집니다
            </p>
          </div>
        )}

        {/* Fields Grid */}
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">기업명</dt>
            <dd className="font-medium">{company.name}</dd>
          </div>
          {PROFILE_FIELDS.map((field) => {
            const value = company[field.key as keyof typeof company];
            const Icon = field.icon;
            const displayValue =
              field.key === "foundedAt" && value
                ? new Date(value as string).toLocaleDateString("ko-KR")
                : value || "-";

            return (
              <div key={field.key}>
                <dt className="text-sm text-muted-foreground flex items-center gap-1">
                  <Icon className="h-3 w-3" />
                  {field.label}
                </dt>
                <dd className={`font-medium ${!value ? "text-muted-foreground" : ""}`}>
                  {displayValue as string}
                </dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}
