import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common";
import { getUserDiagnoses } from "@/lib/diagnosis";
import { DiagnosisStatus } from "@/types/diagnosis";

const STATUS_LABELS: Record<DiagnosisStatus, string> = {
  pending: "대기 중",
  processing: "분석 중",
  completed: "완료",
  failed: "실패",
};

const STATUS_VARIANTS: Record<
  DiagnosisStatus,
  "default" | "outline" | "secondary" | "destructive"
> = {
  pending: "secondary",
  processing: "secondary",
  completed: "default",
  failed: "destructive",
};

function getFitScoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

export default async function DiagnosisListPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // 서버에서 직접 데이터 페칭 (API 호출 없이)
  const { diagnoses, total } = await getUserDiagnoses(session.user.id, {
    page: 1,
    limit: 20,
  });

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <PageHeader
        title="부족항목 진단"
        description={`총 ${total}건의 진단 결과`}
      />

      {diagnoses.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              아직 진단 결과가 없습니다.
            </p>
            <Button asChild>
              <Link href="/matching">매칭 시작하기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4">
          {diagnoses.map((diagnosis) => (
            <Link
              key={diagnosis.id}
              href={`/diagnosis/${diagnosis.id}`}
              className="block"
            >
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">
                          {diagnosis.company?.name || "기업"}
                        </h3>
                        <Badge variant={STATUS_VARIANTS[diagnosis.status]}>
                          {STATUS_LABELS[diagnosis.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {diagnosis.project?.name || "지원사업"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(diagnosis.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>

                    <div className="text-right">
                      {diagnosis.status === "completed" && (
                        <div
                          className={`text-3xl font-bold ${getFitScoreColor(
                            diagnosis.fitScore
                          )}`}
                        >
                          {diagnosis.fitScore ?? "-"}
                          <span className="text-sm font-normal text-muted-foreground">
                            점
                          </span>
                        </div>
                      )}
                      {diagnosis.status === "processing" && (
                        <p className="text-sm text-muted-foreground">분석 중...</p>
                      )}
                      {diagnosis.status === "failed" && (
                        <p className="text-sm text-destructive">분석 실패</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
