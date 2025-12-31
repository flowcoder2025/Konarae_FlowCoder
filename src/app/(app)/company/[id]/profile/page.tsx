import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { checkCompanyPermission } from "@/lib/rebac"
import { PageHeader } from "@/components/common"
import { ProfileBlocksView } from "./profile-blocks-view"
import { MasterProfileCTA } from "@/components/company/master-profile-cta"
import { getOrCreateCredit } from "@/lib/credits"
import {
  BLOCK_CATEGORIES,
  MIN_ANALYZED_DOCUMENTS,
  REQUIRED_DOCUMENT_GROUPS,
  calculateExpectedQuality,
  getExpectedQualityLevel,
  MASTER_PROFILE_GENERATION_COST,
} from "@/lib/master-profile/constants"
import type { MasterProfileStatus } from "@/lib/master-profile/types"
import type { Metadata } from "next"
import {
  Building2,
  Briefcase,
  TrendingUp,
  Users,
  Award,
  Trophy,
  Zap,
  Target,
  type LucideIcon,
} from "lucide-react"

// 아이콘 이름 → 컴포넌트 매핑
const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  Briefcase,
  TrendingUp,
  Users,
  Award,
  Trophy,
  Zap,
  Target,
}

interface ProfilePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id, deletedAt: null },
    select: { name: true },
  })

  return {
    title: company ? `${company.name} - 마스터 프로필` : "마스터 프로필",
    description: "기업 마스터 프로필을 관리합니다. AI가 분석한 문서 데이터를 사업계획서에 활용하세요.",
    robots: { index: false, follow: false },
  }
}

export default async function CompanyProfilePage({ params }: ProfilePageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const { id: companyId } = await params

  // 권한 체크
  const hasPermission = await checkCompanyPermission(session.user.id, companyId, "viewer")
  if (!hasPermission) {
    redirect("/companies")
  }

  const canEdit = await checkCompanyPermission(session.user.id, companyId, "admin")

  // 기업 정보 조회
  const company = await prisma.company.findUnique({
    where: { id: companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      businessNumber: true,
    },
  })

  if (!company) {
    notFound()
  }

  // 마스터 프로필 조회
  const profile = await prisma.companyMasterProfile.findUnique({
    where: { companyId },
    include: {
      blocks: {
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { blockOrder: "asc" }],
      },
    },
  })

  // 분석된 문서 조회
  const analyzedDocuments = await prisma.companyDocument.findMany({
    where: {
      companyId,
      status: "analyzed",
      deletedAt: null,
    },
    select: {
      id: true,
      documentType: true,
    },
  })

  // 크레딧 정보
  const creditInfo = await getOrCreateCredit(session.user.id)

  // 생성 관련 계산
  const documentTypes = analyzedDocuments.map((d) => d.documentType)
  const missingRequiredGroups: string[][] = []
  for (const group of REQUIRED_DOCUMENT_GROUPS) {
    const hasRequired = group.some((type) => documentTypes.includes(type))
    if (!hasRequired) {
      missingRequiredGroups.push([...group])
    }
  }

  const isFirstGeneration = !profile || profile.isFreeGeneration
  const requiredCredit = isFirstGeneration ? 0 : MASTER_PROFILE_GENERATION_COST

  const canGenerate =
    analyzedDocuments.length >= MIN_ANALYZED_DOCUMENTS &&
    missingRequiredGroups.length === 0 &&
    (isFirstGeneration || creditInfo.balance >= requiredCredit)

  const qualityScore = calculateExpectedQuality(documentTypes)
  const expectedQuality = getExpectedQualityLevel(qualityScore)

  // 블록을 카테고리별로 그룹핑
  const blocksByCategory = profile?.blocks.reduce(
    (acc, block) => {
      if (!acc[block.category]) {
        acc[block.category] = []
      }
      acc[block.category].push(block)
      return acc
    },
    {} as Record<string, typeof profile.blocks>
  ) || {}

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <PageHeader
        title="마스터 프로필"
        description={`${company.name}의 AI 분석 기반 프로필`}
        listHref={`/companies/${companyId}`}
        listLabel="기업 상세"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 왼쪽: CTA 및 정보 */}
        <div className="space-y-6">
          <MasterProfileCTA
            companyId={companyId}
            companyName={company.name}
            profileStatus={profile?.status as MasterProfileStatus | null}
            analyzedDocumentCount={analyzedDocuments.length}
            canGenerate={canGenerate}
            isFirstGeneration={isFirstGeneration}
            requiredCredit={requiredCredit}
            currentBalance={creditInfo.balance}
            expectedQuality={expectedQuality}
            missingRequiredGroups={missingRequiredGroups}
          />

          {/* 카테고리 목록 */}
          {profile && profile.status === "completed" && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-3">프로필 구성</h3>
              <div className="space-y-2">
                {BLOCK_CATEGORIES.map((category) => {
                  const blocks = blocksByCategory[category.id] || []
                  const hasBlocks = blocks.length > 0
                  return (
                    <a
                      key={category.id}
                      href={`#${category.id}`}
                      className={`flex items-center justify-between text-sm p-2 rounded-md transition-colors ${
                        hasBlocks
                          ? "hover:bg-muted"
                          : "text-muted-foreground opacity-50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {(() => {
                          const IconComponent = ICON_MAP[category.icon]
                          return IconComponent ? <IconComponent className="h-4 w-4" /> : null
                        })()}
                        <span>{category.label}</span>
                      </span>
                      {hasBlocks && (
                        <span className="text-xs text-muted-foreground">
                          {blocks.length}
                        </span>
                      )}
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 프로필 블록 목록 */}
        <div className="lg:col-span-2">
          {profile && profile.status === "completed" ? (
            <ProfileBlocksView
              companyId={companyId}
              blocks={profile.blocks}
              blocksByCategory={blocksByCategory}
              canEdit={canEdit}
            />
          ) : profile?.status === "generating" ? (
            <div className="flex items-center justify-center h-64 rounded-lg border border-dashed">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  프로필을 생성하고 있습니다...
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 rounded-lg border border-dashed">
              <div className="text-center max-w-sm">
                <p className="text-muted-foreground mb-2">
                  아직 마스터 프로필이 없습니다
                </p>
                <p className="text-sm text-muted-foreground">
                  왼쪽의 버튼을 클릭하여 AI 기반 프로필을 생성하세요.
                  문서를 더 많이 업로드할수록 품질이 향상됩니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
