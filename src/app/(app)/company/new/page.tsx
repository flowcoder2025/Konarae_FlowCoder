import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompanyForm } from "@/components/companies/company-form";
import { PageHeader } from "@/components/common";

/**
 * New Company Page
 *
 * This dedicated route takes precedence over /company/[id]
 * to prevent routing conflicts when id="new"
 */
export default async function NewCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto max-w-6xl py-8">
      <PageHeader
        title="기업 등록"
        description="새로운 기업을 등록하고 지원사업 매칭을 시작하세요"
        listHref="/company"
        listLabel="기업 정보"
      />

      <CompanyForm />
    </div>
  );
}
