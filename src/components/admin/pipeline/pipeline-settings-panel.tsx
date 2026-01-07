"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Settings,
  Save,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
} from "lucide-react";

interface PipelineSetting {
  id: string;
  type: string;
  enabled: boolean;
  schedule: string | null;
  batchSize: number;
  maxRetries: number;
  timeout: number;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  crawl: "크롤링",
  parse: "파싱",
  embed: "임베딩",
};

const TYPE_COLORS: Record<string, string> = {
  crawl: "text-green-500",
  parse: "text-blue-500",
  embed: "text-purple-500",
};

export function PipelineSettingsPanel() {
  const [settings, setSettings] = useState<PipelineSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editedSettings, setEditedSettings] = useState<Record<string, Partial<PipelineSetting>>>({});

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/pipeline/settings");
      if (!response.ok) throw new Error("Failed to fetch settings");
      const data = await response.json();
      setSettings(data);
      setEditedSettings({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (type: string, field: keyof PipelineSetting, value: unknown) => {
    setEditedSettings((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value,
      },
    }));
  };

  const handleSave = async (type: string) => {
    const edited = editedSettings[type];
    if (!edited) return;

    setSaving(type);
    setError(null);

    try {
      const response = await fetch("/api/admin/pipeline/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...edited }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save settings");
      }

      const updated = await response.json();
      setSettings((prev) =>
        prev.map((s) => (s.type === type ? updated : s))
      );
      setEditedSettings((prev) => {
        const newState = { ...prev };
        delete newState[type];
        return newState;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(null);
    }
  };

  const getSettingValue = (setting: PipelineSetting, field: keyof PipelineSetting) => {
    const edited = editedSettings[setting.type];
    if (edited && field in edited) {
      return edited[field as keyof typeof edited];
    }
    return setting[field];
  };

  const hasChanges = (type: string) => {
    return !!editedSettings[type] && Object.keys(editedSettings[type]).length > 0;
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>설정 로드 중...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">자동화 설정</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchSettings} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {settings.map((setting) => (
          <div
            key={setting.id}
            className="p-4 border rounded-lg space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${TYPE_COLORS[setting.type]}`}>
                  {TYPE_LABELS[setting.type] || setting.type}
                </span>
                <Badge
                  variant={getSettingValue(setting, "enabled") ? "default" : "secondary"}
                >
                  {getSettingValue(setting, "enabled") ? "활성화" : "비활성화"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {hasChanges(setting.type) && (
                  <Button
                    size="sm"
                    onClick={() => handleSave(setting.type)}
                    disabled={saving === setting.type}
                  >
                    {saving === setting.type ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-1" />
                        저장
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Settings Grid */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {/* Enabled */}
              <div className="space-y-2">
                <Label>자동 실행</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={getSettingValue(setting, "enabled") as boolean}
                    onCheckedChange={(checked) =>
                      handleChange(setting.type, "enabled", checked)
                    }
                  />
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  스케줄 (Cron)
                </Label>
                <Input
                  value={(getSettingValue(setting, "schedule") as string) || ""}
                  onChange={(e) =>
                    handleChange(setting.type, "schedule", e.target.value || null)
                  }
                  placeholder="0 16 * * *"
                />
                <p className="text-xs text-muted-foreground">
                  예: 0 16 * * * (UTC)
                </p>
              </div>

              {/* Batch Size */}
              <div className="space-y-2">
                <Label>배치 크기</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={getSettingValue(setting, "batchSize") as number}
                  onChange={(e) =>
                    handleChange(setting.type, "batchSize", parseInt(e.target.value) || 50)
                  }
                />
              </div>

              {/* Max Retries */}
              <div className="space-y-2">
                <Label>최대 재시도</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={getSettingValue(setting, "maxRetries") as number}
                  onChange={(e) =>
                    handleChange(setting.type, "maxRetries", parseInt(e.target.value) || 3)
                  }
                />
              </div>
            </div>

            {/* Last Updated */}
            <div className="text-xs text-muted-foreground">
              마지막 수정: {new Date(setting.updatedAt).toLocaleString("ko-KR")}
            </div>
          </div>
        ))}
      </div>

      {/* Help Text */}
      <p className="mt-6 text-sm text-muted-foreground">
        자동화 설정은 Vercel Cron 또는 QStash 스케줄러에서 사용됩니다.
        스케줄은 UTC 시간 기준 Cron 표현식으로 입력합니다 (예: KST 01:00 = UTC 16:00 = &quot;0 16 * * *&quot;).
      </p>
    </Card>
  );
}
