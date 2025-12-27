"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertCircle, ExternalLink, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface Step1DetailProps {
  projectUrl: string | null;
  onComplete: () => void;
}

const CHECKLIST_ITEMS = [
  {
    id: "eligibility",
    label: "지원 자격 요건 확인",
    description: "우리 기업이 지원 대상에 해당하는지 확인했습니다",
  },
  {
    id: "documents",
    label: "필수 제출서류 확인",
    description: "제출해야 할 서류 목록을 확인했습니다",
  },
  {
    id: "deadline",
    label: "마감일 및 일정 확인",
    description: "접수 마감일과 선정 일정을 확인했습니다",
  },
  {
    id: "budget",
    label: "지원 규모 및 조건 확인",
    description: "지원 금액, 매칭 비율 등 조건을 확인했습니다",
  },
];

export function Step1Detail({ projectUrl, onComplete }: Step1DetailProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const handleCheckChange = (itemId: string, checked: boolean) => {
    const newChecked = new Set(checkedItems);
    if (checked) {
      newChecked.add(itemId);
    } else {
      newChecked.delete(itemId);
    }
    setCheckedItems(newChecked);
  };

  const allChecked = checkedItems.size === CHECKLIST_ITEMS.length;

  return (
    <div className="space-y-6">
      {/* Instruction */}
      <div className="p-4 bg-muted/50 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">공고 내용을 꼼꼼히 확인해주세요</p>
            <p className="text-sm text-muted-foreground mt-1">
              지원 자격, 필수 제출서류, 마감일 등 핵심 사항을 체크한 후 다음 단계로 진행하세요.
              놓치는 항목이 있으면 신청이 반려될 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      {/* Original Document Link */}
      {projectUrl && (
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <a href={projectUrl} target="_blank" rel="noopener noreferrer">
            공고 원문 새 창에서 보기
            <ExternalLink className="h-4 w-4 ml-2" />
          </a>
        </Button>
      )}

      {/* Checklist */}
      <div className="space-y-4">
        <h4 className="font-medium">확인 체크리스트</h4>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`
                flex items-start gap-3 p-4 rounded-lg border transition-colors
                ${checkedItems.has(item.id) ? "border-primary/50 bg-primary/5" : "border-border"}
              `}
            >
              <Checkbox
                id={item.id}
                checked={checkedItems.has(item.id)}
                onCheckedChange={(checked) =>
                  handleCheckChange(item.id, checked === true)
                }
                className="mt-0.5"
              />
              <Label htmlFor={item.id} className="flex-1 cursor-pointer">
                <span className="font-medium">{item.label}</span>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {item.description}
                </p>
              </Label>
              {checkedItems.has(item.id) && (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Complete Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete} disabled={!allChecked}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          확인 완료, 다음 단계로
        </Button>
      </div>

      {!allChecked && (
        <p className="text-sm text-muted-foreground text-right">
          모든 항목을 체크해야 다음 단계로 진행할 수 있습니다
        </p>
      )}
    </div>
  );
}
