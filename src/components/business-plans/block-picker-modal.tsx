"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Sparkles,
  Search,
  Check,
  FileText,
  Loader2,
  AlertCircle,
  Copy,
} from "lucide-react"
import { BLOCK_CATEGORIES } from "@/lib/master-profile/constants"
import type { ProfileBlock } from "@prisma/client"
import { toast } from "sonner"

interface BlockPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  /** 선택 모드: single(하나만) / multiple(여러 개) */
  mode?: "single" | "multiple"
  /** 블록 선택 시 콜백 - 마크다운 콘텐츠 전달 */
  onSelect?: (content: string) => void
  /** 여러 블록 선택 시 콜백 */
  onSelectMultiple?: (blocks: ProfileBlock[]) => void
}

interface GroupedBlocks {
  [category: string]: ProfileBlock[]
}

export function BlockPickerModal({
  open,
  onOpenChange,
  companyId,
  mode = "single",
  onSelect,
  onSelectMultiple,
}: BlockPickerModalProps) {
  const [blocks, setBlocks] = useState<ProfileBlock[]>([])
  const [groupedBlocks, setGroupedBlocks] = useState<GroupedBlocks>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set())

  // 블록 목록 로드
  useEffect(() => {
    if (!open) return

    const fetchBlocks = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/companies/${companyId}/master-profile/blocks?groupByCategory=true`
        )

        if (!response.ok) {
          if (response.status === 404) {
            setError("마스터 프로필이 없습니다. 먼저 프로필을 생성해주세요.")
            return
          }
          throw new Error("블록을 불러오는데 실패했습니다")
        }

        const data = await response.json()
        setGroupedBlocks(data.blocks)

        // 평탄화된 블록 목록
        const allBlocks = Object.values(data.blocks).flat() as ProfileBlock[]
        setBlocks(allBlocks)
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 오류"
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchBlocks()
  }, [open, companyId])

  // 검색 필터링
  const filteredBlocks = blocks.filter((block) => {
    const matchesSearch =
      searchQuery === "" ||
      block.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      block.content.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory =
      selectedCategory === "all" || block.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // 카테고리별 필터링된 블록
  const filteredGrouped = Object.entries(groupedBlocks).reduce(
    (acc, [category, categoryBlocks]) => {
      const filtered = categoryBlocks.filter((block) => {
        const matchesSearch =
          searchQuery === "" ||
          block.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          block.content.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesCategory =
          selectedCategory === "all" || block.category === selectedCategory

        return matchesSearch && matchesCategory
      })
      if (filtered.length > 0) {
        acc[category] = filtered
      }
      return acc
    },
    {} as GroupedBlocks
  )

  // 블록 선택 토글
  const handleToggleBlock = useCallback(
    (block: ProfileBlock) => {
      if (mode === "single") {
        onSelect?.(block.content)
        onOpenChange(false)
        toast.success("블록이 삽입되었습니다")
      } else {
        setSelectedBlocks((prev) => {
          const next = new Set(prev)
          if (next.has(block.id)) {
            next.delete(block.id)
          } else {
            next.add(block.id)
          }
          return next
        })
      }
    },
    [mode, onSelect, onOpenChange]
  )

  // 다중 선택 완료
  const handleConfirmSelection = useCallback(() => {
    const selected = blocks.filter((b) => selectedBlocks.has(b.id))
    if (selected.length === 0) {
      toast.error("블록을 선택해주세요")
      return
    }

    onSelectMultiple?.(selected)
    onOpenChange(false)
    toast.success(`${selected.length}개 블록이 선택되었습니다`)
  }, [blocks, selectedBlocks, onSelectMultiple, onOpenChange])

  // 클립보드 복사
  const handleCopyContent = useCallback(
    async (content: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(content)
        toast.success("클립보드에 복사되었습니다")
      } catch {
        toast.error("복사에 실패했습니다")
      }
    },
    []
  )

  // 카테고리 정보 가져오기
  const getCategoryInfo = (categoryId: string) => {
    return BLOCK_CATEGORIES.find((c) => c.id === categoryId) || {
      id: categoryId,
      label: categoryId,
      icon: "📄",
    }
  }

  // 활성 카테고리 목록 (블록이 있는 카테고리만)
  const activeCategories = BLOCK_CATEGORIES.filter(
    (c) => groupedBlocks[c.id]?.length > 0
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            마스터 프로필 블록 선택
          </DialogTitle>
          <DialogDescription>
            사업계획서에 삽입할 블록을 선택하세요. 마크다운 형식으로 삽입됩니다.
          </DialogDescription>
        </DialogHeader>

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="블록 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* 카테고리 탭 */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList className="w-full flex-wrap h-auto p-1">
            <TabsTrigger value="all" className="text-xs">
              전체 ({blocks.length})
            </TabsTrigger>
            {activeCategories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="text-xs"
              >
                {category.icon} {category.label} (
                {groupedBlocks[category.id]?.length || 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {/* 블록 목록 */}
          <TabsContent value={selectedCategory} className="mt-0">
            <div className="flex-1 overflow-auto min-h-[300px] max-h-[400px] space-y-4 py-2">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              ) : filteredBlocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? "검색 결과가 없습니다"
                      : "사용 가능한 블록이 없습니다"}
                  </p>
                </div>
              ) : (
                Object.entries(filteredGrouped).map(
                  ([category, categoryBlocks]) => {
                    const categoryInfo = getCategoryInfo(category)
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                          <span>{categoryInfo.icon}</span>
                          <span className="text-sm font-medium">
                            {categoryInfo.label}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {categoryBlocks.length}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {categoryBlocks.map((block) => {
                            const isSelected = selectedBlocks.has(block.id)
                            return (
                              <Card
                                key={block.id}
                                className={`p-3 cursor-pointer transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "hover:border-primary/50"
                                }`}
                                onClick={() => handleToggleBlock(block)}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm truncate">
                                        {block.title}
                                      </span>
                                      {block.isAiGenerated && (
                                        <Sparkles className="h-3 w-3 text-primary shrink-0" />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                      {block.content.substring(0, 150)}
                                      {block.content.length > 150 && "..."}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 ml-2 shrink-0">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={(e) =>
                                        handleCopyContent(block.content, e)
                                      }
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                    {mode === "multiple" && (
                                      <div
                                        className={`h-5 w-5 rounded border flex items-center justify-center ${
                                          isSelected
                                            ? "bg-primary border-primary"
                                            : "border-border"
                                        }`}
                                      >
                                        {isSelected && (
                                          <Check className="h-3 w-3 text-primary-foreground" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                )
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {mode === "multiple" && (
            <Button
              onClick={handleConfirmSelection}
              disabled={selectedBlocks.size === 0}
            >
              <Check className="mr-2 h-4 w-4" />
              {selectedBlocks.size}개 선택 완료
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
