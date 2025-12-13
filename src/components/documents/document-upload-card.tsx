/**
 * 문서 업로드 카드 컴포넌트
 * 10가지 문서 유형 중 하나
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DocumentMetadata, DocumentType } from "@/lib/documents/types";
import { FileText, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface DocumentUploadCardProps {
  metadata: DocumentMetadata;
  companyId: string;
  existingDocument?: {
    id: string;
    status: string;
    fileName: string;
    uploadedAt: Date;
  };
  onUploadComplete?: () => void;
}

export function DocumentUploadCard({
  metadata,
  companyId,
  existingDocument,
  onUploadComplete,
}: DocumentUploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  const getStatusBadge = () => {
    if (!existingDocument) {
      return metadata.required ? (
        <Badge variant="destructive">필수</Badge>
      ) : (
        <Badge variant="outline">선택</Badge>
      );
    }

    const statusMap: Record<string, { label: string; variant: any }> = {
      uploaded: { label: "업로드 완료", variant: "secondary" },
      analyzing: { label: "분석 중", variant: "default" },
      analyzed: { label: "분석 완료", variant: "default" },
      failed: { label: "실패", variant: "destructive" },
    };

    const status = statusMap[existingDocument.status] || statusMap.uploaded;
    return <Badge variant={status.variant}>{status.label}</Badge>;
  };

  const getStatusIcon = () => {
    if (!existingDocument) {
      return <FileText className="h-6 w-6 text-muted-foreground" />;
    }

    switch (existingDocument.status) {
      case "analyzed":
        return <CheckCircle2 className="h-6 w-6 text-green-600" />;
      case "analyzing":
        return <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-6 w-6 text-red-600" />;
      default:
        return <FileText className="h-6 w-6 text-gray-600" />;
    }
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium text-sm">{metadata.label}</h3>
            <p className="text-xs text-muted-foreground">
              {metadata.description}
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {existingDocument && (
        <div className="mb-3 p-2 bg-muted rounded-md">
          <p className="text-xs text-muted-foreground">
            {existingDocument.fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(existingDocument.uploadedAt).toLocaleDateString("ko-KR")}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2 bg-red-50 text-red-600 rounded-md text-xs">
          {error}
        </div>
      )}

      {uploading && (
        <div className="mb-3">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            업로드 중... {progress}%
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant={existingDocument ? "outline" : "default"}
          size="sm"
          disabled={uploading}
          className="w-full"
          onClick={() => document.getElementById(`file-${metadata.type}`)?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          {existingDocument ? "수정 등록" : "업로드"}
        </Button>

        <input
          id={`file-${metadata.type}`}
          type="file"
          accept={metadata.acceptedFormats.join(",")}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        {metadata.acceptedFormats.join(", ")} | 최대 {metadata.maxSize}MB
      </p>
    </Card>
  );
}
