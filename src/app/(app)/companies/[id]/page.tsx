import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Mail, Phone, MapPin, Users, Calendar } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/common";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  // Check permission
  const hasPermission = await checkCompanyPermission(session.user.id, id, "viewer");
  if (!hasPermission) {
    redirect("/companies");
  }

  const company = await prisma.company.findUnique({
    where: { id, deletedAt: null },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
      financials: {
        orderBy: {
          fiscalYear: "desc",
        },
        take: 3,
      },
      certifications: {
        where: {
          isActive: true,
        },
        orderBy: {
          issueDate: "desc",
        },
        take: 5,
      },
      _count: {
        select: {
          businessPlans: true,
          matchingResults: true,
        },
      },
    },
  });

  if (!company) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <PageHeader
        title={company.name}
        description={`사업자등록번호: ${company.businessNumber}`}
        listHref="/companies"
        listLabel="기업 목록"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">대표:</span> {company.representativeName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">설립일:</span>{" "}
                {format(company.establishedDate, "yyyy년 MM월 dd일")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">전화:</span> {company.phone}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">이메일:</span> {company.email}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">주소:</span> {company.address}{" "}
                {company.addressDetail}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>인증 현황</CardTitle>
            <CardDescription>
              {company.certifications.length}개의 인증 보유
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {company.isVenture && <Badge>벤처기업</Badge>}
              {company.isInnoBiz && <Badge>이노비즈</Badge>}
              {company.isMainBiz && <Badge>메인비즈</Badge>}
              {company.isSocial && <Badge>사회적기업</Badge>}
              {company.isWomen && <Badge>여성기업</Badge>}
              {company.isDisabled && <Badge>장애인기업</Badge>}
              {!company.isVenture &&
                !company.isInnoBiz &&
                !company.isMainBiz &&
                !company.isSocial &&
                !company.isWomen &&
                !company.isDisabled && (
                  <p className="text-sm text-muted-foreground">인증 정보 없음</p>
                )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>멤버</CardTitle>
            <CardDescription>{company.members.length}명</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {company.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{member.user.name || "이름 없음"}</p>
                      <p className="text-xs text-muted-foreground">{member.user.email}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{member.role}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>활동 요약</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">사업계획서</span>
              <span className="font-medium">{company._count.businessPlans}개</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">매칭 결과</span>
              <span className="font-medium">{company._count.matchingResults}개</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
