"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, EyeOff, Eye, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface ProjectActionsProps {
  projectId: string
  projectName: string
  isHidden?: boolean
  onActionComplete?: () => void
}

export function ProjectActions({
  projectId,
  projectName,
  isHidden = false,
  onActionComplete,
}: ProjectActionsProps) {
  const router = useRouter()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleHideToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsLoading(true)

    try {
      const response = await fetch(`/api/user-projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: !isHidden }),
      })

      if (!response.ok) {
        throw new Error("Failed to update project")
      }

      toast.success(isHidden ? "프로젝트가 다시 표시됩니다" : "프로젝트를 숨겼습니다")
      router.refresh()
      onActionComplete?.()
    } catch (error) {
      toast.error("오류가 발생했습니다")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/user-projects/${projectId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete project")
      }

      toast.success("프로젝트가 삭제되었습니다")
      router.refresh()
      onActionComplete?.()
    } catch (error) {
      toast.error("삭제 중 오류가 발생했습니다")
    } finally {
      setIsLoading(false)
      setIsDeleteDialogOpen(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <span className="sr-only">메뉴 열기</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={handleHideToggle} disabled={isLoading}>
            {isHidden ? (
              <>
                <Eye className="mr-2 h-4 w-4" />
                다시 표시
              </>
            ) : (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                숨기기
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDeleteDialogOpen(true)
            }}
            disabled={isLoading}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{projectName}&quot; 프로젝트를 삭제합니다.
              <br />
              삭제된 프로젝트는 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
