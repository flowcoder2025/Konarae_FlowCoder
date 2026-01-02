import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createLogger } from "@/lib/logger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Plus,
  FileText,
  Edit,
  Upload,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  CompanySelector,
  CompanyProfileCard,
  DocumentStatsCards,
  DocumentTypeCard,
} from "@/components/company";
import type { CompanyOption } from "@/components/company";

const logger = createLogger({ page: "company" });

// Document type labels
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  business_registration: "사업자등록증",
  corporation_registry: "법인등기부등본",
  sme_certificate: "중소기업확인서",
  financial_statement: "재무제표",
  employment_insurance: "고용보험자격이력내역서",
  export_performance: "수출실적증명원",
  certification: "인증서",
  company_introduction: "회사소개서",
  business_plan: "사업계획서",
  patent: "특허증",
};

interface CompanyData {
  id: string;
  name: string;
  registrationNumber: string | null;
  industry: string | null;
  size: string | null;
  address: string | null;
  representativeName: string | null;
  foundedAt: string | null;
  isOwner: boolean;
  documentsCount: number;
  documents: Array<{
    id: string;
    type: string;
    fileName: string;
    uploadedAt: string;
    hasAnalysis: boolean;
  }>;
}

interface Props {
  searchParams: Promise<{ id?: string }>;
}

async function getUserCompanies(userId: string): Promise<CompanyOption[]> {
  const memberships = await prisma.companyMember.findMany({
    where: { userId },
    include: {
      company: { select: { id: true, name: true } },
    },
    orderBy: { invitedAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.company.id,
    name: m.company.name,
    isOwner: m.role === "owner",
  }));
}

async function getCompanyData(userId: string, companyId?: string): Promise<CompanyData | null> {
  const whereClause = companyId
    ? { userId, companyId }
    : { userId };

  const companyMember = await prisma.companyMember.findFirst({
    where: whereClause,
    include: {
      company: {
        include: {
          documents: {
            orderBy: { uploadedAt: "desc" },
            include: {
              analysis: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!companyMember) return null;

  const company = companyMember.company;

  return {
    id: company.id,
    name: company.name,
    registrationNumber: company.businessNumber,
    industry: company.businessCategory || company.mainBusiness || null,
    size: company.companySize,
    address: company.address,
    representativeName: company.representativeName,
    foundedAt: company.establishedDate?.toISOString() || null,
    isOwner: companyMember.role === "owner",
    documentsCount: company.documents.length,
    documents: company.documents.map((d) => ({
      id: d.id,
      type: d.documentType,
      fileName: d.fileName,
      uploadedAt: d.uploadedAt.toISOString(),
      hasAnalysis: d.analysis !== null,
    })),
  };
}

export default async function CompanyPage({ searchParams }: Props) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id: selectedCompanyId } = await searchParams;

  let companies: CompanyOption[] = [];
  let company: CompanyData | null = null;
  let error = false;

  try {
    companies = await getUserCompanies(session.user.id);
    if (companies.length > 0) {
      const targetCompanyId = selectedCompanyId || companies[0].id;
      company = await getCompanyData(session.user.id, targetCompanyId);
    }
  } catch (e) {
    logger.error("Failed to load company data", { error: e });
    error = true;
  }

  // If no company, show registration CTA
  if (companies.length === 0 && !error) {
    return (
      <div className="container mx-auto py-8 max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">기업을 등록해주세요</h1>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              기업 정보를 등록하면 맞춤 지원사업을 추천받고,
              <br />
              증빙 서류를 한 곳에서 관리할 수 있어요
            </p>
            <Button size="lg" asChild>
              <Link href="/companies/new">
                <Plus className="h-4 w-4 mr-2" />
                기업 등록하기
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="container mx-auto py-8 max-w-3xl">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.
        </div>
      </div>
    );
  }

  // Group documents by type
  const documentsByType: Record<string, typeof company.documents> = {};
  company.documents.forEach((doc) => {
    if (!documentsByType[doc.type]) {
      documentsByType[doc.type] = [];
    }
    documentsByType[doc.type].push(doc);
  });

  // Calculate document stats
  const analyzedCount = company.documents.filter((d) => d.hasAnalysis).length;
  const pendingCount = company.documents.filter((d) => !d.hasAnalysis).length;

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          </div>
          <div className="min-w-0">
            {/* Company Selector for multiple companies */}
            {companies.length > 1 ? (
              <CompanySelector
                companies={companies}
                currentCompanyId={company.id}
              />
            ) : (
              <h1 className="text-xl sm:text-2xl font-bold truncate">{company.name}</h1>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {company.isOwner && (
            <Button variant="outline" asChild className="w-full sm:w-auto shrink-0">
              <Link href={`/companies/${company.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                수정
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild className="w-full sm:w-auto shrink-0">
            <Link href="/companies/new">
              <Plus className="h-4 w-4 mr-2" />
              새 기업 추가
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="space-y-4 sm:space-y-6">
        <div className="overflow-x-auto scrollbar-hide touch-scroll -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full sm:w-full h-9 sm:h-10">
            <TabsTrigger value="profile" className="gap-1.5 shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">
              <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="whitespace-nowrap">기업 정보</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="whitespace-nowrap">증빙</span>
              <span className="text-[10px] sm:text-xs bg-muted px-1 sm:px-1.5 rounded">
                {company.documentsCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="master-profile" className="gap-1.5 shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="whitespace-nowrap">마스터</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <CompanyProfileCard
            company={{
              name: company.name,
              registrationNumber: company.registrationNumber,
              industry: company.industry,
              size: company.size,
              address: company.address,
              representativeName: company.representativeName,
              foundedAt: company.foundedAt,
            }}
          />

          {/* Quick Stats */}
          <DocumentStatsCards
            totalDocuments={company.documentsCount}
            analyzedDocuments={analyzedCount}
            pendingDocuments={pendingCount}
          />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">증빙 보관함</h2>
              <p className="text-sm text-muted-foreground">
                지원사업 제출에 필요한 서류를 업로드하고 관리하세요
              </p>
            </div>
            <Button asChild>
              <Link href={`/companies/${company.id}/documents`}>
                <Upload className="h-4 w-4 mr-2" />
                서류 업로드
              </Link>
            </Button>
          </div>

          {company.documentsCount === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  아직 업로드된 서류가 없습니다
                </p>
                <Button variant="outline" asChild>
                  <Link href={`/companies/${company.id}/documents`}>
                    첫 서류 업로드하기
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(documentsByType).map(([type, docs]) => (
                <DocumentTypeCard
                  key={type}
                  typeId={type}
                  typeLabel={DOCUMENT_TYPE_LABELS[type] || type}
                  documents={docs}
                  companyId={company.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Master Profile Tab */}
        <TabsContent value="master-profile" className="space-y-4">
          <Card>
            <CardContent className="py-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">AI 마스터 프로필</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    업로드된 증빙 서류를 AI가 분석하여 사업계획서 작성에 활용할 수 있는
                    기업 프로필을 자동 생성합니다.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button asChild>
                      <Link href={`/company/${company.id}/profile`}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        마스터 프로필 관리
                      </Link>
                    </Button>
                    {analyzedCount === 0 && (
                      <p className="text-xs text-muted-foreground">
                        * 분석된 문서가 있어야 프로필을 생성할 수 있습니다
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
