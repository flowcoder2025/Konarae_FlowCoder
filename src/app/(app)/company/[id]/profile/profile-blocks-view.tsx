"use client"

import { useState, useCallback, Suspense } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Pencil,
  Check,
  X,
  Trash2,
  Sparkles,
  FileText,
  Clock,
  Copy,
  CheckCheck,
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
import { BLOCK_CATEGORIES } from "@/lib/master-profile/constants"
import type { ProfileBlock } from "@prisma/client"
import { toast } from "sonner"

// 동적 import: ReactMarkdown - 무거운 마크다운 파서
const ReactMarkdown = dynamic(
  () => import("react-markdown").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <Skeleton className="h-20 w-full" />,
  }
)

// remark-gfm은 ReactMarkdown과 함께 사용되므로 별도로 import
import remarkGfm from "remark-gfm"

interface ProfileBlocksViewProps {
  companyId: string
  blocks: ProfileBlock[]
  blocksByCategory: Record<string, ProfileBlock[]>
  canEdit: boolean
}

interface EditingState {
  blockId: string
  title: string
  content: string
}

export function ProfileBlocksView({
  companyId,
  blocks,
  blocksByCategory,
  canEdit,
}: ProfileBlocksViewProps) {
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleEdit = useCallback((block: ProfileBlock) => {
    setEditing({
      blockId: block.id,
      title: block.title,
      content: block.content,
    })
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditing(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!editing) return

    setSaving(true)
    try {
      const response = await fetch(
        `/api/companies/${companyId}/master-profile/blocks/${editing.blockId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editing.title,
            content: editing.content,
          }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "저장에 실패했습니다")
      }

      toast.success("블록이 저장되었습니다")
      setEditing(null)
      // 페이지 새로고침으로 데이터 갱신
      window.location.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }, [editing, companyId])

  const handleDelete = useCallback(async (blockId: string) => {
    if (!confirm("이 블록을 삭제하시겠습니까?")) return

    try {
      const response = await fetch(
        `/api/companies/${companyId}/master-profile/blocks/${blockId}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "삭제에 실패했습니다")
      }

      toast.success("블록이 삭제되었습니다")
      window.location.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류"
      toast.error(message)
    }
  }, [companyId])

  const handleCopy = useCallback(async (block: ProfileBlock) => {
    try {
      await navigator.clipboard.writeText(block.content)
      setCopiedId(block.id)
      toast.success("클립보드에 복사되었습니다")
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error("복사에 실패했습니다")
    }
  }, [])

  return (
    <div className="space-y-8">
      {BLOCK_CATEGORIES.map((category) => {
        const categoryBlocks = blocksByCategory[category.id] || []
        if (categoryBlocks.length === 0) return null

        return (
          <div key={category.id} id={category.id}>
            <div className="flex items-center gap-2 mb-4">
              {(() => {
                const IconComponent = ICON_MAP[category.icon]
                return IconComponent ? <IconComponent className="h-5 w-5" /> : null
              })()}
              <h2 className="text-lg font-semibold">{category.label}</h2>
              <Badge variant="secondary" className="text-xs">
                {categoryBlocks.length}개 블록
              </Badge>
            </div>

            <div className="space-y-4">
              {categoryBlocks.map((block) => {
                const isEditing = editing?.blockId === block.id

                return (
                  <Card key={block.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {isEditing ? (
                            <Input
                              value={editing.title}
                              onChange={(e) =>
                                setEditing({ ...editing, title: e.target.value })
                              }
                              className="font-semibold"
                              placeholder="블록 제목"
                            />
                          ) : (
                            <CardTitle className="text-base">
                              {block.title}
                            </CardTitle>
                          )}
                          <CardDescription className="flex items-center gap-2 mt-1">
                            {block.isAiGenerated ? (
                              <>
                                <Sparkles className="h-3 w-3" />
                                <span>AI 생성</span>
                              </>
                            ) : (
                              <>
                                <FileText className="h-3 w-3" />
                                <span>수동 작성</span>
                              </>
                            )}
                            {block.isEdited && (
                              <>
                                <span>•</span>
                                <span className="text-primary">편집됨</span>
                              </>
                            )}
                            <span>•</span>
                            <Clock className="h-3 w-3" />
                            <span>
                              {new Date(block.updatedAt).toLocaleDateString("ko-KR")}
                            </span>
                          </CardDescription>
                        </div>

                        {canEdit && !isEditing && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopy(block)}
                            >
                              {copiedId === block.id ? (
                                <CheckCheck className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(block)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(block.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}

                        {isEditing && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={handleCancelEdit}
                              disabled={saving}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              className="h-8 w-8"
                              onClick={handleSave}
                              disabled={saving}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isEditing ? (
                        <Textarea
                          value={editing.content}
                          onChange={(e) =>
                            setEditing({ ...editing, content: e.target.value })
                          }
                          className="min-h-[200px] font-mono text-sm"
                          placeholder="블록 내용 (마크다운 지원)"
                        />
                      ) : (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {block.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* 출처 문서 표시 */}
                      {block.sourceDocumentTypes &&
                        block.sourceDocumentTypes.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-1">
                              출처 문서:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {block.sourceDocumentTypes.map((type, idx) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {getDocumentTypeName(type)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}

      {blocks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">생성된 블록이 없습니다</p>
        </div>
      )}
    </div>
  )
}

function getDocumentTypeName(type: string): string {
  const typeNames: Record<string, string> = {
    business_registration: "사업자등록증",
    corporation_registry: "법인등기부등본",
    sme_certificate: "중소기업확인서",
    financial_statement: "재무제표",
    employment_insurance: "고용보험가입확인서",
    export_performance: "수출실적증명서",
    certification: "인증서",
    company_introduction: "회사소개서",
    business_plan: "기존 사업계획서",
    patent: "특허",
  }
  return typeNames[type] || type
}
