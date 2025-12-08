"use client";

/**
 * ProjectFiles - 프로젝트 첨부파일 목록 컴포넌트
 * Supabase Storage에 저장된 파일을 서명된 URL로 다운로드 제공
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet, Download, Loader2 } from "lucide-react";

interface ProjectFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileSizeFormatted: string;
  downloadUrl: string | null;
  isParsed: boolean;
  createdAt: string;
}

interface ProjectFilesResponse {
  projectId: string;
  projectName: string;
  totalFiles: number;
  files: ProjectFile[];
}

interface ProjectFilesProps {
  projectId: string;
}

// 파일 타입별 아이콘
function FileIcon({ fileType }: { fileType: string }) {
  switch (fileType) {
    case "pdf":
      return <FileText className="h-5 w-5 text-red-500" />;
    case "hwp":
    case "hwpx":
      return <FileSpreadsheet className="h-5 w-5 text-blue-500" />;
    default:
      return <FileText className="h-5 w-5 text-gray-500" />;
  }
}

// 파일 타입 라벨
function FileTypeLabel({ fileType }: { fileType: string }) {
  const labels: Record<string, string> = {
    pdf: "PDF",
    hwp: "HWP",
    hwpx: "HWPX",
    unknown: "파일",
  };
  return (
    <span className="text-xs uppercase font-medium text-muted-foreground">
      {labels[fileType] || fileType.toUpperCase()}
    </span>
  );
}

export function ProjectFiles({ projectId }: ProjectFilesProps) {
  const [data, setData] = useState<ProjectFilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFiles() {
      try {
        setLoading(true);
        const response = await fetch(`/api/projects/${projectId}/files`);

        if (!response.ok) {
          throw new Error("파일 목록을 불러올 수 없습니다");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다");
      } finally {
        setLoading(false);
      }
    }

    fetchFiles();
  }, [projectId]);

  // 로딩 상태
  if (loading) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold mb-4">첨부파일</h2>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          파일 목록 로딩 중...
        </div>
      </Card>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold mb-4">첨부파일</h2>
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    );
  }

  // 파일 없음
  if (!data || data.totalFiles === 0) {
    return null; // 파일이 없으면 섹션 숨김
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-4">
        첨부파일 ({data.totalFiles}개)
      </h2>
      <div className="space-y-3">
        {data.files.map((file) => (
          <div
            key={file.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <FileIcon fileType={file.fileType} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" title={file.fileName}>
                  {cleanFileName(file.fileName)}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileTypeLabel fileType={file.fileType} />
                  <span>•</span>
                  <span>{file.fileSizeFormatted}</span>
                </div>
              </div>
            </div>
            {file.downloadUrl ? (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="shrink-0 ml-3"
              >
                <a
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Download className="h-4 w-4 mr-1" />
                  다운로드
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled className="shrink-0 ml-3">
                다운로드 불가
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * 파일명 정리 (jsessionid 등 제거)
 */
function cleanFileName(fileName: string): string {
  // getImageFile.do;jsessionid=xxx 형태에서 정리
  if (fileName.includes(";jsessionid=")) {
    return "첨부파일";
  }
  // URL 인코딩된 한글 디코딩
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}
