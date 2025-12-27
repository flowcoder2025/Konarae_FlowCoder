"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Package,
  Download,
  CheckCircle2,
  FileArchive,
  File,
  FileText,
  FileSpreadsheet,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useState } from "react";

interface PackageFile {
  id: string;
  name: string;
  type: "pdf" | "xlsx" | "zip" | "other";
  size: string;
  included: boolean;
}

interface Step5PackageProps {
  projectId: string;
  projectUrl: string | null;
  onComplete: () => void;
}

const FILE_ICONS = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  zip: FileArchive,
  other: File,
};

const SUBMISSION_CHECKLIST = [
  {
    id: "files",
    label: "제출 파일 확인",
    description: "모든 파일이 올바른 형식으로 포함되어 있습니다",
  },
  {
    id: "naming",
    label: "파일명 규칙 확인",
    description: "파일명이 공고 요구사항을 따르고 있습니다",
  },
  {
    id: "portal",
    label: "제출처 확인",
    description: "온라인 접수 시스템 또는 이메일 주소를 확인했습니다",
  },
  {
    id: "deadline",
    label: "마감 시간 확인",
    description: "접수 마감 시간을 다시 한번 확인했습니다",
  },
];

export function Step5Package({
  projectId,
  projectUrl,
  onComplete,
}: Step5PackageProps) {
  const [isPackaging, setIsPackaging] = useState(false);
  const [packageReady, setPackageReady] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Mock files - in real implementation, fetch from API
  const [files] = useState<PackageFile[]>([
    {
      id: "1",
      name: "사업계획서_주식회사코나래.pdf",
      type: "pdf",
      size: "2.4 MB",
      included: true,
    },
    {
      id: "2",
      name: "사업자등록증_주식회사코나래.pdf",
      type: "pdf",
      size: "0.5 MB",
      included: true,
    },
    {
      id: "3",
      name: "재무제표_2024.xlsx",
      type: "xlsx",
      size: "1.2 MB",
      included: true,
    },
    {
      id: "4",
      name: "중소기업확인서.pdf",
      type: "pdf",
      size: "0.3 MB",
      included: true,
    },
  ]);

  const handleCreatePackage = async () => {
    setIsPackaging(true);

    // Simulate package creation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsPackaging(false);
    setPackageReady(true);
  };

  const handleCheckChange = (itemId: string, checked: boolean) => {
    const newChecked = new Set(checkedItems);
    if (checked) {
      newChecked.add(itemId);
    } else {
      newChecked.delete(itemId);
    }
    setCheckedItems(newChecked);
  };

  const allChecked = checkedItems.size === SUBMISSION_CHECKLIST.length;
  const includedFiles = files.filter((f) => f.included);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 bg-muted/50 rounded-lg">
        <div className="flex items-start gap-3">
          <Package className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">패키징 & 제출 준비</p>
            <p className="text-sm text-muted-foreground mt-1">
              제출할 파일들을 한번에 다운로드하고, 최종 체크리스트를 확인하세요.
            </p>
          </div>
        </div>
      </div>

      {/* Files List */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium flex items-center gap-2">
              <FileArchive className="h-4 w-4" />
              제출 파일 목록
              <Badge variant="secondary">{includedFiles.length}개</Badge>
            </h4>
            {!packageReady && (
              <Button onClick={handleCreatePackage} disabled={isPackaging} size="sm">
                {isPackaging ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    패키징 중...
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4 mr-2" />
                    ZIP 패키지 생성
                  </>
                )}
              </Button>
            )}
            {packageReady && (
              <Button size="sm">
                <Download className="h-4 w-4 mr-2" />
                제출파일.zip 다운로드
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {files.map((file) => {
              const FileIcon = FILE_ICONS[file.type];

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium truncate">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{file.size}</span>
                  {file.included && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Submission Checklist */}
      <div className="space-y-4">
        <h4 className="font-medium">제출 전 최종 체크리스트</h4>
        <div className="space-y-3">
          {SUBMISSION_CHECKLIST.map((item) => (
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

      {/* Submit Portal Link */}
      {projectUrl && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">접수처 바로가기</p>
                  <p className="text-sm text-muted-foreground">
                    온라인 접수 시스템에서 파일을 업로드하세요
                  </p>
                </div>
              </div>
              <Button variant="outline" asChild>
                <a href={projectUrl} target="_blank" rel="noopener noreferrer">
                  접수처 열기
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Button */}
      <div className="flex justify-between items-center pt-4 border-t">
        <p className="text-sm text-muted-foreground">
          {allChecked
            ? "모든 항목을 확인했습니다. 제출을 완료해주세요."
            : "체크리스트를 모두 확인해주세요"}
        </p>
        <Button
          onClick={onComplete}
          disabled={!allChecked || !packageReady}
          className="bg-green-600 hover:bg-green-700"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          제출 완료로 표시
        </Button>
      </div>
    </div>
  );
}
