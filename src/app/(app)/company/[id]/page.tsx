import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkCompanyPermission } from "@/lib/rebac";
import { getOrCreateCredit } from "@/lib/credits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Mail, Phone, MapPin, Users, Calendar, Briefcase, Lightbulb, Pencil, Factory, FileText, Tag, Target, Eye, FolderOpen, Settings2, Sparkles } from "lucide-react";
import { MatchingPreferencesForm } from "@/components/company/matching-preferences-form";
import { MasterProfileCTA } from "@/components/company/master-profile-cta";
import { format } from "date-fns";
import { PageHeader } from "@/components/common";
import Link from "next/link";
import type { Metadata } from "next";
import {
  MASTER_PROFILE_GENERATION_COST,
  MIN_ANALYZED_DOCUMENTS,
  REQUIRED_DOCUMENT_GROUPS,
  calculateExpectedQuality,
  getExpectedQualityLevel,
} from "@/lib/master-profile/constants";
import type { MasterProfileStatus } from "@/lib/master-profile/types";

interface CompanyDetailPageProps {
  params: Promise<{ id: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mate.flow-coder.com";

export async function generateMetadata({
  params,
}: CompanyDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id, deletedAt: null },
    select: {
      name: true,
      businessCategory: true,
      mainBusiness: true,
      introduction: true,
      isVenture: true,
      isInnoBiz: true,
      isMainBiz: true,
      isSocial: true,
    },
  });

  if (!company) {
    return {
      title: "기업을 찾을 수 없습니다",
      description: "요청하신 기업 정보를 찾을 수 없습니다.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const certifications = [
    company.isVenture && "벤처기업",
    company.isInnoBiz && "이노비즈",
    company.isMainBiz && "메인비즈",
    company.isSocial && "사회적기업",
  ].filter((c): c is string => Boolean(c));

  const description =
    company.introduction ||
    company.mainBusiness ||
    `${company.name}의 기업 정보 페이지입니다.`;

  const truncatedDescription =
    description.length > 160
      ? description.substring(0, 157) + "..."
      : description;

  const keywords = ["기업정보", company.name];
  if (company.businessCategory) keywords.push(company.businessCategory);
  keywords.push(...certifications);

  return {
    title: company.businessCategory
      ? `${company.name} - ${company.businessCategory}`
      : company.name,
    description: truncatedDescription,
    keywords,
    robots: {
      index: false, // 인증 필요 페이지이므로 검색엔진 색인 제외
      follow: false,
    },
    openGraph: {
      title: `${company.name} | FlowMate`,
      description: truncatedDescription,
      type: "profile",
      url: `${SITE_URL}/companies/${id}`,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: company.name,
        },
      ],
    },
  };
}

export default async function CompanyDetailPage({
  params,
}: CompanyDetailPageProps) {
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

  // Check edit permission
  const canEdit = await checkCompanyPermission(session.user.id, id, "admin");

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
          documents: true,
        },
      },
    },
  });

  if (!company) {
    notFound();
  }

  // 마스터 프로필 정보 조회
  const [masterProfile, analyzedDocuments, creditInfo] = await Promise.all([
    prisma.companyMasterProfile.findUnique({
      where: { companyId: id },
      select: { id: true, status: true, isFreeGeneration: true },
    }),
    prisma.companyDocument.findMany({
      where: { companyId: id, status: "analyzed", deletedAt: null },
      select: { documentType: true },
    }),
    getOrCreateCredit(session.user.id),
  ]);

  // 마스터 프로필 생성 관련 계산
  const documentTypes = analyzedDocuments.map((d) => d.documentType);
  const missingRequiredGroups: string[][] = [];
  for (const group of REQUIRED_DOCUMENT_GROUPS) {
    if (!group.some((type) => documentTypes.includes(type))) {
      missingRequiredGroups.push([...group]);
    }
  }
  const isFirstGeneration = !masterProfile || masterProfile.isFreeGeneration;
  const requiredCredit = isFirstGeneration ? 0 : MASTER_PROFILE_GENERATION_COST;
  const canGenerateProfile =
    analyzedDocuments.length >= MIN_ANALYZED_DOCUMENTS &&
    missingRequiredGroups.length === 0 &&
    (isFirstGeneration || creditInfo.balance >= requiredCredit);
  const qualityScore = calculateExpectedQuality(documentTypes);
  const expectedQuality = getExpectedQualityLevel(qualityScore);

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <PageHeader
        title={company.name}
        description={`사업자등록번호: ${company.businessNumber}`}
        listHref="/companies"
        listLabel="기업 목록"
        actions={
          canEdit ? (
            <Link href={`/companies/${id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4 mr-2" />
                수정
              </Button>
            </Link>
          ) : undefined
        }
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

        {(() => {
          const certCount = [
            company.isVenture,
            company.isInnoBiz,
            company.isMainBiz,
            company.isSocial,
            company.isWomen,
            company.isDisabled,
          ].filter(Boolean).length;

          return (
            <Card>
              <CardHeader>
                <CardTitle>인증 현황</CardTitle>
                <CardDescription>
                  {certCount}개의 인증 보유
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
                  {certCount === 0 && (
                    <p className="text-sm text-muted-foreground">인증 정보 없음</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}

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

      {/* 문서 관리 섹션 */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              기업 문서 관리
            </CardTitle>
            <CardDescription>
              각종 서류를 업로드하면 AI가 자동으로 분석하여 매칭 및 사업계획서 작성에 활용합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  업로드된 문서: <span className="font-medium text-foreground">{company._count.documents}개</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  사업자등록증, 재무제표, 인증서 등 10종류의 문서 관리 가능
                </p>
              </div>
              <Link href={`/companies/${id}/documents`}>
                <Button>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  문서 관리
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 마스터 프로필 섹션 */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              마스터 프로필
            </CardTitle>
            <CardDescription>
              AI가 문서를 분석하여 사업계획서용 프로필 블록을 자동 생성합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MasterProfileCTA
              companyId={id}
              companyName={company.name}
              profileStatus={masterProfile?.status as MasterProfileStatus | null}
              analyzedDocumentCount={analyzedDocuments.length}
              canGenerate={canGenerateProfile}
              isFirstGeneration={isFirstGeneration}
              requiredCredit={requiredCredit}
              currentBalance={creditInfo.balance}
              expectedQuality={expectedQuality}
              missingRequiredGroups={missingRequiredGroups}
            />
          </CardContent>
        </Card>
      </div>

      {/* 사업 정보 섹션 */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              사업 정보
            </CardTitle>
            <CardDescription>
              상세한 사업 정보는 매칭 정확도를 높입니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Factory className="h-4 w-4" />
                  업종
                </div>
                <p className="text-sm font-medium">
                  {company.businessCategory || (
                    <span className="text-muted-foreground italic">미입력</span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  주요 사업내용
                </div>
                <p className="text-sm font-medium">
                  {company.mainBusiness || (
                    <span className="text-muted-foreground italic">미입력</span>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="h-4 w-4" />
                주요 아이템/제품
              </div>
              {company.businessItems && company.businessItems.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {company.businessItems.map((item, idx) => (
                    <Badge key={idx} variant="secondary">{item}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">미입력</p>
              )}
            </div>

            {(company.introduction || company.vision || company.mission) && (
              <div className="border-t pt-4 space-y-4">
                {company.introduction && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      기업 소개
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{company.introduction}</p>
                  </div>
                )}
                {company.vision && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      비전
                    </div>
                    <p className="text-sm">{company.vision}</p>
                  </div>
                )}
                {company.mission && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="h-4 w-4" />
                      미션
                    </div>
                    <p className="text-sm">{company.mission}</p>
                  </div>
                )}
              </div>
            )}

            {!company.businessCategory && !company.mainBusiness && (!company.businessItems || company.businessItems.length === 0) && (
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  💡 <span className="font-medium">매칭 정확도 향상 팁:</span> 업종, 사업내용, 주요 아이템 등 상세 정보를 입력하면 더 정확한 지원사업 매칭이 가능합니다.
                </p>
                {canEdit && (
                  <Link href={`/companies/${id}/edit`}>
                    <Button variant="outline" size="sm" className="mt-2">
                      <Pencil className="h-3 w-3 mr-1" />
                      상세정보 입력하기
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 매칭 선호도 설정 섹션 */}
      <div className="mt-6">
        <MatchingPreferencesForm companyId={id} canEdit={canEdit} />
      </div>
    </div>
  );
}
