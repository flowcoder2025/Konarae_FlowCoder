import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createLogger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Plus,
  FileText,
  Settings,
  Edit,
  Upload,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";

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

async function getCompanyData(userId: string): Promise<CompanyData | null> {
  const companyMember = await prisma.companyMember.findFirst({
    where: { userId },
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

export default async function CompanyPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  let company: CompanyData | null = null;
  let error = false;

  try {
    company = await getCompanyData(session.user.id);
  } catch (e) {
    logger.error("Failed to load company data", { error: e });
    error = true;
  }

  // If no company, show registration CTA
  if (!company && !error) {
    return (
      <div className="container mx-auto py-8 max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
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

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <p className="text-muted-foreground">
              {company.registrationNumber || "사업자번호 미등록"}
            </p>
          </div>
        </div>
        {company.isOwner && (
          <Button variant="outline" asChild>
            <Link href={`/companies/${company.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              정보 수정
            </Link>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">
            <Building2 className="h-4 w-4 mr-2" />
            기업 정보
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-2" />
            증빙 보관함
            <Badge variant="secondary" className="ml-2">
              {company.documentsCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
              <CardDescription>
                지원사업 매칭에 사용되는 기업 정보입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 md:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">기업명</dt>
                  <dd className="font-medium">{company.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">사업자등록번호</dt>
                  <dd className="font-medium">
                    {company.registrationNumber || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">업종</dt>
                  <dd className="font-medium">{company.industry || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">기업 규모</dt>
                  <dd className="font-medium">{company.size || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">대표자명</dt>
                  <dd className="font-medium">
                    {company.representativeName || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">설립일</dt>
                  <dd className="font-medium">
                    {company.foundedAt
                      ? new Date(company.foundedAt).toLocaleDateString("ko-KR")
                      : "-"}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-sm text-muted-foreground">주소</dt>
                  <dd className="font-medium">{company.address || "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {company.documents.filter((d) => d.hasAnalysis).length}
                    </p>
                    <p className="text-sm text-muted-foreground">분석 완료 서류</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {company.documents.filter((d) => !d.hasAnalysis).length}
                    </p>
                    <p className="text-sm text-muted-foreground">분석 대기</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{company.documentsCount}</p>
                    <p className="text-sm text-muted-foreground">전체 서류</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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
              <Link href={`/companies/${company.id}/documents/upload`}>
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
                  <Link href={`/companies/${company.id}/documents/upload`}>
                    첫 서류 업로드하기
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(documentsByType).map(([type, docs]) => (
                <Card key={type}>
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {DOCUMENT_TYPE_LABELS[type] || type}
                      </CardTitle>
                      <Badge variant="secondary">{docs.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="py-0 pb-4">
                    <div className="space-y-2">
                      {docs.slice(0, 3).map((doc) => (
                        <Link
                          key={doc.id}
                          href={`/companies/${company.id}/documents/${doc.id}`}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{doc.fileName}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {doc.hasAnalysis ? (
                              <Badge variant="outline" className="text-green-600">
                                분석완료
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600">
                                대기중
                              </Badge>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </Link>
                      ))}
                      {docs.length > 3 && (
                        <Link
                          href={`/companies/${company.id}/documents?type=${type}`}
                          className="block text-center text-sm text-primary hover:underline py-2"
                        >
                          +{docs.length - 3}개 더보기
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
