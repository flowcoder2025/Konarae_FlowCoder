"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight, Upload, Loader2, RefreshCw, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";

interface Document {
  id: string;
  fileName: string;
  hasAnalysis: boolean;
  uploadedAt: string;
}

interface DocumentTypeCardProps {
  typeId: string;
  typeLabel: string;
  documents: Document[];
  companyId: string;
  maxItems?: number;
  onDocumentAction?: () => void;
}

export function DocumentTypeCard({
  typeId,
  typeLabel,
  documents,
  companyId,
  maxItems = 3,
  onDocumentAction,
}: DocumentTypeCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const visibleDocs = documents.slice(0, maxItems);
  const remainingCount = documents.length - maxItems;

  const handleDownload = async (docId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      setActionLoading(docId);
      const response = await fetch(`/api/companies/${companyId}/documents/${docId}`);

      if (!response.ok) {
        throw new Error("다운로드 실패");
      }

      const data = await response.json();
      if (data.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch {
      toast.error("다운로드에 실패했습니다");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReanalyze = async (docId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      setActionLoading(docId);
      const response = await fetch(`/api/companies/${companyId}/documents/${docId}/reanalyze`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("재분석 요청 실패");
      }

      toast.success("재분석을 시작합니다. 잠시 후 새로고침해주세요.");
      onDocumentAction?.();
    } catch {
      toast.error("재분석 요청에 실패했습니다");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (docId: string, fileName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`"${fileName}" 문서를 삭제하시겠습니까?`)) return;

    try {
      setActionLoading(docId);
      const response = await fetch(`/api/companies/${companyId}/documents/${docId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("삭제 실패");
      }

      toast.success("문서가 삭제되었습니다");
      onDocumentAction?.();
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{typeLabel}</CardTitle>
          <Badge variant="secondary">{documents.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="py-0 pb-4">
        {documents.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">
              등록된 서류가 없습니다
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/companies/${companyId}/documents`}>
                <Upload className="h-3 w-3 mr-1" />
                업로드
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{doc.fileName}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {doc.hasAnalysis ? (
                    <Badge variant="outline" className="text-green-600 text-xs">
                      분석완료
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-yellow-600 text-xs">
                      대기중
                    </Badge>
                  )}
                  {actionLoading === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => handleDownload(doc.id, e)}
                        title="다운로드"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {!doc.hasAnalysis && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => handleReanalyze(doc.id, e)}
                          title="재분석"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => handleDelete(doc.id, doc.fileName, e)}
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {remainingCount > 0 && (
              <Link
                href={`/companies/${companyId}/documents`}
                className="block text-center text-sm text-primary hover:underline py-2"
              >
                +{remainingCount}개 더보기
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
