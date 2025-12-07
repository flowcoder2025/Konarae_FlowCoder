/**
 * Add Crawl Source Dialog - Client Component
 * Dialog for adding new crawl source
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database } from "lucide-react";
import { toast } from "sonner";
import { addCrawlSource } from "@/lib/actions/admin-actions";

export function AddSourceDialog() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    type: "web" as "web" | "api",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.url) {
      toast.error("모든 필드를 입력해주세요");
      return;
    }

    setIsLoading(true);
    try {
      const result = await addCrawlSource(formData);

      if (result.success) {
        toast.success(result.message);
        setOpen(false);
        setFormData({ name: "", url: "", type: "web" });
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("소스 추가 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Database className="mr-2 h-4 w-4" />
          소스 추가
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>크롤링 소스 추가</DialogTitle>
          <DialogDescription>
            새로운 크롤링 소스를 등록합니다
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">소스 이름</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="예: K-Startup 공고"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) =>
                  setFormData({ ...formData, url: e.target.value })
                }
                placeholder="https://example.com"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">타입</Label>
              <Select
                value={formData.type}
                onValueChange={(value: "web" | "api") =>
                  setFormData({ ...formData, type: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">웹</SelectItem>
                  <SelectItem value="api">API</SelectItem>
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
