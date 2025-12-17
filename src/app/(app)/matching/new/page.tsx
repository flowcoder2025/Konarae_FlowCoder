"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Target, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

interface MatchingResult {
  projectId: string;
  matchingResultId?: string | null;
  project: {
    id: string;
    name: string;
    organization: string;
    category: string;
    summary: string;
    deadline?: string | null;
    amountMin?: string | null;
    amountMax?: string | null;
  };
  totalScore: number;
  businessSimilarityScore: number; // 사업 유사도 (50%)
  categoryScore: number; // 업종 적합도 (25%)
  eligibilityScore: number; // 자격 요건 (25%)
  confidence: "high" | "medium" | "low";
  matchReasons: string[];
}

interface MatchingResponse {
  success: boolean;
  results: MatchingResult[];
  totalMatches: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
}

export default function MatchingNewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get("companyId");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MatchingResponse | null>(null);
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);

  // Fetch company info
  useEffect(() => {
    if (!companyId) return;

    fetch(`/api/companies/${companyId}`)
      .then((res) => {
        if (!res.ok) throw new Error("기업 정보를 불러올 수 없습니다");
        return res.json();
      })
      .then((data) => setCompany({ id: data.id, name: data.name }))
      .catch((err) => setError(err.message));
  }, [companyId]);

  const executeMatching = async () => {
    if (!companyId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          saveResults: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "매칭 실행에 실패했습니다");
      }

      const data: MatchingResponse = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  if (!companyId) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-semibold mb-2">기업을 선택해주세요</h2>
          <p className="text-muted-foreground mb-4">
            매칭을 실행하려면 기업을 먼저 선택해야 합니다.
          </p>
          <Link href="/matching">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              매칭 대시보드로 돌아가기
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/matching"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          매칭 대시보드
        </Link>
        <h1 className="text-3xl font-bold mb-2">
          {company?.name || "..."} 매칭 실행
        </h1>
        <p className="text-muted-foreground">
          기업 정보를 기반으로 적합한 지원사업을 찾습니다
        </p>
      </div>

      {/* Error State */}
      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execute Button */}
      {!results && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              매칭 실행
            </CardTitle>
            <CardDescription>
              AI가 기업 정보와 지원사업을 분석하여 최적의 매칭 결과를 제공합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="lg"
              onClick={executeMatching}
              disabled={loading || !company}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  매칭 분석 중...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  매칭 실행하기
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                매칭 완료
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{results.totalMatches}</div>
                  <div className="text-sm text-muted-foreground">총 매칭</div>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{results.highConfidence}</div>
                  <div className="text-sm text-muted-foreground">높은 적합도</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{results.mediumConfidence}</div>
                  <div className="text-sm text-muted-foreground">중간 적합도</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">{results.lowConfidence}</div>
                  <div className="text-sm text-muted-foreground">낮은 적합도</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Result List */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">매칭 결과</h2>
            {results.results.slice(0, 20).map((result) => (
              <Card key={result.projectId} className="hover:border-primary transition-colors">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant={
                            result.confidence === "high"
                              ? "default"
                              : result.confidence === "medium"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {result.confidence === "high"
                            ? "높은 적합도"
                            : result.confidence === "medium"
                            ? "중간 적합도"
                            : "낮은 적합도"}
                        </Badge>
                        <span className="font-semibold">{result.totalScore}점</span>
                      </div>
                      <h3 className="font-semibold mb-1">{result.project.name}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {result.project.organization} • {result.project.category}
                      </p>
                      <p className="text-sm line-clamp-2">{result.project.summary}</p>
                      {result.matchReasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {result.matchReasons.slice(0, 3).map((reason, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Link
                      href={
                        result.matchingResultId
                          ? `/matching/results/${result.matchingResultId}`
                          : `/projects/${result.projectId}`
                      }
                    >
                      <Button variant="outline" size="sm">
                        상세보기
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-4 mt-8">
            <Link href="/matching/results">
              <Button variant="outline">전체 결과 보기</Button>
            </Link>
            <Button onClick={() => setResults(null)}>다시 매칭하기</Button>
          </div>
        </>
      )}
    </div>
  );
}
