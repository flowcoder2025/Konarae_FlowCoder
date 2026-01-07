"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Brain,
  Server,
  Laptop,
} from "lucide-react";

interface EmbedResult {
  jobId: string;
  mode: "local" | "worker";
  processed: number;
  success: number;
  failed: number;
  message: string;
  details?: Array<{
    id: string;
    name: string;
    status: "success" | "failed" | "skipped";
    message?: string;
  }>;
}

export function EmbedPanel() {
  const [batchSize, setBatchSize] = useState(50);
  const [force, setForce] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EmbedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunEmbed = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/pipeline/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize, force }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Embed failed");
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
        <Brain className="h-5 w-5 text-purple-500" />
        <h3 className="text-lg font-semibold">벡터 임베딩</h3>
      </div>

      <div className="space-y-6">
        {/* Controls */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="embedBatchSize">배치 크기</Label>
            <Input
              id="embedBatchSize"
              type="number"
              min={1}
              max={100}
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 50)}
              disabled={running}
            />
            <p className="text-xs text-muted-foreground">
              한 번에 처리할 프로젝트 수
            </p>
          </div>

          <div className="space-y-2">
            <Label>강제 재생성</Label>
            <div className="flex items-center gap-2 h-10">
              <Switch
                id="force"
                checked={force}
                onCheckedChange={setForce}
                disabled={running}
              />
              <Label htmlFor="force" className="text-sm text-muted-foreground">
                {force ? "활성화" : "비활성화"}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              이미 임베딩된 프로젝트도 재처리
            </p>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleRunEmbed}
              disabled={running}
              className="w-full"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  임베딩 중...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  임베딩 실행
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
            {/* Mode Indicator */}
            <div className="flex items-center gap-2">
              {result.mode === "worker" ? (
                <Badge variant="outline" className="gap-1">
                  <Server className="h-3 w-3" />
                  Railway Worker
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Laptop className="h-3 w-3" />
                  Local
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">{result.message}</span>
            </div>

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
            {result.details && result.details.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium">프로젝트명</th>
                        <th className="p-3 text-left text-sm font-medium">상태</th>
                        <th className="p-3 text-left text-sm font-medium">메시지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="p-3 text-sm">
                            <span className="truncate block max-w-[200px]" title={item.name}>
                              {item.name}
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
          needsEmbedding=true인 프로젝트에 대해 벡터 임베딩을 생성합니다.
          Railway Worker가 가용한 경우 Worker에서 처리하고, 그렇지 않으면 로컬에서 제한적으로 처리합니다.
        </p>
      </div>
    </Card>
  );
}
