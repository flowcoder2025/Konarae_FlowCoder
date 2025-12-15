"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

interface SectionEditorProps {
  section: {
    sectionIndex: number;
    title: string;
    content: string;
    isAiGenerated: boolean;
  };
  businessPlanId: string;
  onUpdate: () => void;
}

export function SectionEditor({
  section,
  businessPlanId,
  onUpdate,
}: SectionEditorProps) {
  const [content, setContent] = useState(section.content);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/business-plans/${businessPlanId}/sections/${section.sectionIndex}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to save section");
      }

      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error("Save section error:", error);
      alert("섹션 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm("이 섹션을 AI로 재생성하시겠습니까? 기존 내용은 사라집니다.")) {
      return;
    }

    setIsRegenerating(true);
    try {
      const res = await fetch(
        `/api/business-plans/${businessPlanId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "section",
            sectionIndex: section.sectionIndex,
          }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to regenerate section");
      }

      const data = await res.json();
      setContent(data.content);
      onUpdate();
    } catch (error) {
      console.error("Regenerate section error:", error);
      alert("섹션 재생성에 실패했습니다.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{section.title}</h3>
          {section.isAiGenerated && (
            <span className="text-xs text-muted-foreground">AI 생성</span>
          )}
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isRegenerating}>
                {isRegenerating ? "재생성 중..." : "AI 재생성"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                수정
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setContent(section.content);
                  setIsEditing(false);
                }}
              >
                취소
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "저장 중..." : "저장"}
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <Textarea
          value={content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
          className="min-h-[300px] font-mono text-sm"
        />
      ) : (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // 이미지: placeholder로 대체
              img: ({ src, alt }) => (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                  🖼️ {alt || "이미지"}
                </span>
              ),
              // 테이블 스타일링
              table: ({ children }) => (
                <table className="border-collapse border border-border w-full">
                  {children}
                </table>
              ),
              th: ({ children }) => (
                <th className="border border-border bg-muted px-3 py-2 text-left font-medium">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-border px-3 py-2">{children}</td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </Card>
  );
}
