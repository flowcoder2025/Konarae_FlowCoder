/**
 * /company/[id]/documents
 * 기업 문서 관리 페이지
 */

import { CompanyDocumentsPageClient } from "@/app/(app)/companies/[id]/documents/page-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CompanyDocumentsPage({ params }: PageProps) {
  const { id: companyId } = await params;
  return <CompanyDocumentsPageClient companyId={companyId} />;
}
