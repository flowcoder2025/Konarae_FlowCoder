/**
 * /companies/[id]/documents - Client Component
 * 기업 문서 관리 페이지 클라이언트 컴포넌트
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DocumentUploadCard } from "@/components/documents/document-upload-card";
import {
  DOCUMENT_TYPES,
  DOCUMENT_METADATA,
  DocumentType,
} from "@/lib/documents/types";

interface CompanyDocumentsPageClientProps {
  companyId: string;
}

export function CompanyDocumentsPageClient({
  companyId,
}: CompanyDocumentsPageClientProps) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`/api/companies/${companyId}/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const getExistingDocument = (docType: DocumentType) => {
    return documents.find((doc) => doc.documentType === docType);
  };

  if (loading) {
    return (
      <div className="p-8">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <Link
          href={`/companies/${companyId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          기업 상세로 돌아가기
        </Link>
        <h1 className="text-3xl font-bold mb-2">기업 문서 관리</h1>
        <p className="text-muted-foreground">
          각종 서류를 업로드하면 AI가 자동으로 분석하고 매칭에 활용합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.values(DOCUMENT_TYPES).map((docType) => {
          const metadata = DOCUMENT_METADATA[docType];
          const existingDoc = getExistingDocument(docType);

          return (
            <DocumentUploadCard
              key={docType}
              metadata={metadata}
              companyId={companyId}
              existingDocument={existingDoc}
              onUploadComplete={fetchDocuments}
            />
          );
        })}
      </div>
    </div>
  );
}
