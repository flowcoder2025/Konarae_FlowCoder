"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
} from "lucide-react";

interface ParseResult {
  jobId: string;
  processed: number;
  success: number;
  failed: number;
  details: Array<{
    id: string;
    fileName: string;
    status: "success" | "failed" | "skipped";
    message?: string;
  }>;
}

const ERROR_TYPES = [
  { value: "all", label: "모든 에러" },
  { value: "Download Failed", label: "다운로드 실패" },
  { value: "Timeout", label: "타임아웃" },
  { value: "Parse Error", label: "파싱 에러" },
  { value: "No Text", label: "텍스트 없음" },
  { value: "Other", label: "기타" },
];

export function ParsePanel() {
  const [batchSize, setBatchSize] = useState(20);
  const [errorType, setErrorType] = useState("all");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunParse = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/pipeline/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchSize,
          errorType: errorType === "all" ? undefined : errorType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Parse failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <FileText className="h-5 w-5 text-blue-500" />
        <h3 className="text-lg font-semibold">문서 파싱</h3>
      </div>

      <div className="space-y-6">
        {/* Controls */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="batchSize">배치 크기</Label>
            <Input
              id="batchSize"
              type="number"
              min={1}
              max={100}
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 20)}
              disabled={running}
            />
            <p className="text-xs text-muted-foreground">
              한 번에 처리할 파일 수
            </p>
          </div>

          <div className="space-y-2">
            <Label>에러 유형 필터</Label>
            <Select
              value={errorType}
              onValueChange={setErrorType}
              disabled={running}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ERROR_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              특정 에러 유형만 재시도
            </p>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleRunParse}
              disabled={running}
              className="w-full"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  파싱 중...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  파싱 실행
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">실행 실패</span>
            </div>
            <p className="mt-2 text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">처리됨</div>
                <div className="text-2xl font-bold">{result.processed}</div>
              </div>
              <div className="p-4 bg-green-500/10 rounded-lg">
                <div className="text-sm text-green-600">성공</div>
                <div className="text-2xl font-bold text-green-600">
                  {result.success}
                </div>
              </div>
              <div className="p-4 bg-red-500/10 rounded-lg">
                <div className="text-sm text-red-600">실패</div>
                <div className="text-2xl font-bold text-red-600">
                  {result.failed}
                </div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">Job ID</div>
                <div className="text-xs font-mono truncate" title={result.jobId}>
                  {result.jobId.substring(0, 12)}...
                </div>
              </div>
            </div>

            {/* Details Table */}
            {result.details.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium">파일명</th>
                        <th className="p-3 text-left text-sm font-medium">상태</th>
                        <th className="p-3 text-left text-sm font-medium">메시지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="p-3 text-sm">
                            <span className="truncate block max-w-[200px]" title={item.fileName}>
                              {item.fileName}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                item.status === "success"
                                  ? "default"
                                  : item.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {item.status === "success" && (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              )}
                              {item.status === "failed" && (
                                <XCircle className="h-3 w-3 mr-1" />
                              )}
                              {item.status === "success" && "성공"}
                              {item.status === "failed" && "실패"}
                              {item.status === "skipped" && "건너뜀"}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            <span className="truncate block max-w-[200px]" title={item.message}>
                              {item.message || "-"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Help Text */}
        <p className="text-sm text-muted-foreground">
          파싱 실패한 첨부파일(shouldParse=true, isParsed=false)에 대해 재시도합니다.
          Storage 또는 원본 URL에서 파일을 다시 다운로드하여 파싱을 시도합니다.
        </p>
      </div>
    </Card>
  );
}
