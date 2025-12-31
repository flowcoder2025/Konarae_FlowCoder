"use client";

import { useState } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INQUIRY_CATEGORIES = [
  { value: "service", label: "서비스 이용 문의" },
  { value: "payment", label: "결제/환불 문의" },
  { value: "bug", label: "오류/버그 신고" },
  { value: "feature", label: "기능 제안" },
  { value: "partnership", label: "제휴/협력 문의" },
  { value: "other", label: "기타 문의" },
] as const;

interface SupportFormData {
  name: string;
  email: string;
  phone: string;
  category: string;
  message: string;
}

interface SupportModalProps {
  children?: React.ReactNode;
  triggerClassName?: string;
}

export function SupportModal({ children, triggerClassName }: SupportModalProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SupportFormData>({
    name: "",
    email: "",
    phone: "",
    category: "",
    message: "",
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name || !formData.email || !formData.category || !formData.message) {
      toast.error("입력 오류", {
        description: "필수 항목을 모두 입력해주세요.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const categoryLabel = INQUIRY_CATEGORIES.find(
        (c) => c.value === formData.category
      )?.label;

      const response = await fetch("/api/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: formData.category,
          categoryTitle: categoryLabel,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || "",
          message: formData.message,
          submittedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit");
      }

      toast.success("문의가 접수되었습니다", {
        description: "빠른 시일 내에 답변 드리겠습니다.",
      });

      // Reset form and close modal
      setFormData({
        name: "",
        email: "",
        phone: "",
        category: "",
        message: "",
      });
      setOpen(false);
    } catch {
      toast.error("전송 실패", {
        description: "잠시 후 다시 시도해주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <button className={triggerClassName}>고객센터</button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>고객센터</DialogTitle>
              <DialogDescription>문의사항을 남겨주세요</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Name & Email */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                이름 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="홍길동"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                이메일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Phone & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">연락처</Label>
              <Input
                id="phone"
                placeholder="010-1234-5678"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">
                문의 유형 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, category: value }))
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="선택해주세요" />
                </SelectTrigger>
                <SelectContent>
                  {INQUIRY_CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">
              문의 내용 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="message"
              placeholder="문의하실 내용을 자세히 적어주세요"
              rows={4}
              value={formData.message}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, message: e.target.value }))
              }
              disabled={isSubmitting}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {isSubmitting ? "전송 중..." : "문의하기"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
