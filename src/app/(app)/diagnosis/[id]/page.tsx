import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getDiagnosis } from "@/lib/diagnosis";
import { DiagnosisDetailView } from "@/components/diagnosis/diagnosis-detail-view";

interface DiagnosisDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DiagnosisDetailPage({
  params,
}: DiagnosisDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  // 서버에서 직접 데이터 페칭 (API 호출 없이)
  const diagnosis = await getDiagnosis(id, session.user.id);

  if (!diagnosis) {
    notFound();
  }

  // 클라이언트 컴포넌트에 초기 데이터 전달 (폴링은 클라이언트에서 처리)
  return <DiagnosisDetailView initialData={diagnosis} />;
}
