/**
 * 문서 업로드 카드 컴포넌트
 * 10가지 문서 유형 중 하나
 * 드래그 앤 드랍 지원
 */

"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DocumentMetadata, DocumentType } from "@/lib/documents/types";
import { FileText, Upload, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { useDropzone } from "@/hooks/use-dropzone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

  const handleUpload = useCallback(
    async (file: File) => {
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
    },
    [companyId, metadata.type, onUploadComplete]
  );

  const handleFileDrop = useCallback(
    (files: File[]) => {
      if (files.length > 0) {
        handleUpload(files[0]);
      }
    },
    [handleUpload]
  );

  const handleDropError = useCallback((errorMsg: string) => {
    toast.error(errorMsg);
  }, []);

  const { isDragging, getRootProps, getInputProps, open } = useDropzone({
    accept: metadata.acceptedFormats,
    maxSize: metadata.maxSize * 1024 * 1024,
    multiple: false,
    disabled: uploading,
    onDrop: handleFileDrop,
    onError: handleDropError,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleUpload(file);
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
      pending: { label: "대기 중", variant: "secondary" },
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
      case "pending":
        return <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-6 w-6 text-red-600" />;
      default:
        return <FileText className="h-6 w-6 text-gray-600" />;
    }
  };

  const dropzoneProps = getRootProps();
  const inputProps = getInputProps();

  return (
    <Card
      className={cn(
        "p-4 transition-all",
        isDragging
          ? "ring-2 ring-primary border-primary shadow-lg"
          : "hover:shadow-md"
      )}
    >
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

      {/* 분석 중 안내 메시지 */}
      {(existingDocument?.status === "analyzing" || existingDocument?.status === "pending") && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            AI가 문서를 분석 중입니다. 페이지를 나가셔도 안전하게 처리됩니다.
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

      {/* 드래그 앤 드랍 영역 */}
      <div
        {...dropzoneProps}
        className={cn(
          "mb-3 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50",
          uploading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...inputProps} />
        <div className="flex flex-col items-center text-center">
          <Upload
            className={cn(
              "h-6 w-6 mb-2",
              isDragging ? "text-primary" : "text-muted-foreground"
            )}
          />
          <p className="text-xs text-muted-foreground">
            {isDragging
              ? "여기에 파일을 놓으세요"
              : "파일을 드래그하거나 클릭하여 선택"}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={existingDocument ? "outline" : "default"}
          size="sm"
          disabled={uploading}
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          <Upload className="h-4 w-4 mr-2" />
          {existingDocument ? "수정 등록" : "업로드"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        {metadata.acceptedFormats.join(", ")} | 최대 {metadata.maxSize}MB
      </p>
    </Card>
  );
}
