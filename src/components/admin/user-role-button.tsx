/**
 * User Role Button - Client Component
 * Button for changing user role (requires migration)
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateUserRole } from "@/lib/actions/admin-actions";

type Props = {
  userId: string;
  userName: string;
  currentRole?: "user" | "admin";
};

export function UserRoleButton({ userId, userName, currentRole = "user" }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"user" | "admin">(currentRole);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (selectedRole === currentRole) {
      setOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateUserRole(userId, selectedRole);

      if (result.success) {
        toast.success(result.message);
        setOpen(false);
      } else {
        toast.info(result.message);
      }
    } catch (error) {
      toast.error("권한 변경 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        권한 변경
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 권한 변경</DialogTitle>
            <DialogDescription>
              {userName}의 권한을 변경합니다
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role">권한</Label>
              <Select
                value={selectedRole}
                onValueChange={(value: "user" | "admin") =>
                  setSelectedRole(value)
                }
                disabled={isLoading}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">일반 사용자</SelectItem>
                  <SelectItem value="admin">관리자</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? "변경 중..." : "변경"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
