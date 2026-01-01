import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getBusinessPlan } from "@/lib/business-plans";
import { BusinessPlanDetailView } from "@/components/business-plans/business-plan-detail-view";

interface BusinessPlanDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BusinessPlanDetailPage({
  params,
}: BusinessPlanDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  // 서버에서 직접 데이터 페칭 (API 호출 없이)
  const businessPlan = await getBusinessPlan(id, session.user.id);

  if (!businessPlan) {
    notFound();
  }

  // 클라이언트 컴포넌트에 초기 데이터 전달
  return <BusinessPlanDetailView initialData={businessPlan} />;
}
