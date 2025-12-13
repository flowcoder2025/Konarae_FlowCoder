/**
 * 문서 목록 카드 컴포넌트 (멀티 파일 지원)
 * 각 문서 유형당 여러 파일을 관리
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DocumentMetadata } from "@/lib/documents/types";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Trash2,
  Plus
} from "lucide-react";
import { format } from "date-fns";

interface DocumentFile {
  id: string;
  status: string;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  analyzedAt?: Date;
  version: number;
  uploader: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface DocumentListCardProps {
  metadata: DocumentMetadata;
  companyId: string;
  existingDocuments: DocumentFile[];
  onUploadComplete?: () => void;
}

export function DocumentListCard({
  metadata,
  companyId,
  existingDocuments,
  onUploadComplete,
}: DocumentListCardProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      setProgress(10);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", metadata.type);

      setProgress(30);

      const response = await fetch(
        `/api/companies/${companyId}/documents/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      setProgress(60);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "업로드 실패");
      }

      setProgress(100);

      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        onUploadComplete?.();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("이 문서를 삭제하시겠습니까?")) return;

    try {
      setDeletingId(documentId);
      const response = await fetch(
        `/api/companies/${companyId}/documents/${documentId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "삭제 실패");
      }

      onUploadComplete?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (documentId: string) => {
    try {
      const response = await fetch(
        `/api/companies/${companyId}/documents/${documentId}`
      );

      if (!response.ok) {
        throw new Error("다운로드 실패");
      }

      const data = await response.json();
      if (data.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "다운로드 실패");
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      uploaded: { label: "업로드 완료", variant: "secondary" },
      analyzing: { label: "분석 중", variant: "default" },
      analyzed: { label: "분석 완료", variant: "default" },
      failed: { label: "실패", variant: "destructive" },
    };

    const statusInfo = statusMap[status] || statusMap.uploaded;
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "analyzed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "analyzing":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <div>
            <h3 className="font-medium text-sm">{metadata.label}</h3>
            <p className="text-xs text-muted-foreground">
              {metadata.description}
            </p>
          </div>
        </div>
        {metadata.required ? (
          <Badge variant="destructive">필수</Badge>
        ) : (
          <Badge variant="outline">선택</Badge>
        )}
      </div>

      {/* 파일 목록 */}
      {existingDocuments.length > 0 && (
        <div className="mb-3 space-y-2">
          {existingDocuments.map((doc) => (
            <div
              key={doc.id}
              className="p-3 bg-muted rounded-md space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {getStatusIcon(doc.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(doc.fileSize)} · {" "}
                      {format(new Date(doc.uploadedAt), "yyyy.MM.dd HH:mm")}
                    </p>
                  </div>
                </div>
                {getStatusBadge(doc.status)}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleDownload(doc.id)}
                >
                  <Download className="h-3 w-3 mr-1" />
                  다운로드
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 mr-1" />
                  )}
                  삭제
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 업로드 진행 상태 */}
      {uploading && (
        <div className="mb-3">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            업로드 중... {progress}%
          </p>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 text-red-600 rounded-md text-xs">
          {error}
        </div>
      )}

      {/* 새 파일 추가 버튼 */}
      <div className="flex gap-2">
        <Button
          variant={existingDocuments.length > 0 ? "outline" : "default"}
          size="sm"
          disabled={uploading}
          className="w-full"
          onClick={() => document.getElementById(`file-${metadata.type}`)?.click()}
        >
          {existingDocuments.length > 0 ? (
            <>
              <Plus className="h-4 w-4 mr-2" />
              파일 추가
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              업로드
            </>
          )}
        </Button>

        <input
          id={`file-${metadata.type}`}
          type="file"
          accept={metadata.acceptedFormats.join(",")}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* 안내 문구 */}
      <p className="text-xs text-muted-foreground mt-2">
        {metadata.acceptedFormats.join(", ")} | 최대 {metadata.maxSize}MB
      </p>

      {existingDocuments.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          총 {existingDocuments.length}개 파일
        </p>
      )}
    </Card>
  );
}
