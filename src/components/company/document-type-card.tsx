"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
}

export function DocumentTypeCard({
  typeId,
  typeLabel,
  documents,
  companyId,
  maxItems = 3,
}: DocumentTypeCardProps) {
  const visibleDocs = documents.slice(0, maxItems);
  const remainingCount = documents.length - maxItems;

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
              <Link href={`/companies/${companyId}/documents/upload?type=${typeId}`}>
                <Upload className="h-3 w-3 mr-1" />
                업로드
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleDocs.map((doc) => (
              <Link
                key={doc.id}
                href={`/companies/${companyId}/documents/${doc.id}`}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{doc.fileName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.hasAnalysis ? (
                    <Badge variant="outline" className="text-green-600 text-xs">
                      분석완료
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-yellow-600 text-xs">
                      대기중
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {remainingCount > 0 && (
              <Link
                href={`/companies/${companyId}/documents?type=${typeId}`}
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
