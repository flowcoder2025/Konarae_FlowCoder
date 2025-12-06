import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompanyForm } from "@/components/companies/company-form";

export default async function NewCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">기업 등록</h1>
        <p className="text-muted-foreground mt-2">
          새로운 기업을 등록하고 지원사업 매칭을 시작하세요
        </p>
      </div>

      <CompanyForm />
    </div>
  );
}
