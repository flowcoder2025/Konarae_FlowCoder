/**
 * Project Action Buttons - Client Component
 * Action buttons for project management (view, edit, delete)
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProject } from "@/lib/actions/admin-actions";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
  projectName: string;
};

export function ProjectActionButtons({ projectId, projectName }: Props) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleView = () => {
    // Navigate to project detail page
    router.push(`/projects/${projectId}`);
  };

  const handleEdit = () => {
    // 편집 기능은 Phase 2에서 구현 예정 (admin/projects/[id]/edit 라우트)
    toast.info("편집 기능은 준비 중입니다");
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteProject(projectId);

      if (result.success) {
        toast.success(result.message);
        setShowDeleteDialog(false);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("삭제 중 오류가 발생했습니다");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={handleView}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={handleEdit}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{projectName}&rdquo; 프로젝트를 삭제하시겠습니까?
              <br />이 작업은 취소할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
