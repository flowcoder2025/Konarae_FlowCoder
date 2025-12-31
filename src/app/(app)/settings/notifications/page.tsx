"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPageSkeleton } from "@/components/ui/skeleton";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ page: "notification-settings" });

export default function NotificationSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/notifications/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      setSettings(data.settings);
    } catch (error) {
      logger.error("Fetch settings error", { error });
      alert("설정을 불러올 수 없습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/notifications/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error("Failed to update settings");

      alert("설정이 저장되었습니다.");
    } catch (error) {
      logger.error("Save settings error", { error });
      alert("설정 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <SettingsPageSkeleton />;
  }

  if (!settings) return null;

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">알림 설정</h1>
        <p className="text-muted-foreground">
          원하는 채널과 알림 유형을 선택하세요
        </p>
      </div>

      <div className="space-y-6">
        {/* Email Notifications */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">이메일 알림</h2>
              <p className="text-sm text-muted-foreground">
                이메일로 알림을 받습니다
              </p>
            </div>
            <Switch
              checked={settings.emailEnabled}
              onCheckedChange={(checked: boolean) =>
                setSettings({ ...settings, emailEnabled: checked })
              }
            />
          </div>
        </Card>

        {/* Discord Notifications */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">Discord 알림</h2>
              <p className="text-sm text-muted-foreground">
                Discord 채널로 알림을 받습니다
              </p>
            </div>
            <Switch
              checked={settings.discordEnabled}
              onCheckedChange={(checked: boolean) =>
                setSettings({ ...settings, discordEnabled: checked })
              }
            />
          </div>

          {settings.discordEnabled && (
            <div className="space-y-2">
              <Label htmlFor="discordWebhook">Discord Webhook URL</Label>
              <Input
                id="discordWebhook"
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={settings.discordWebhookUrl || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    discordWebhookUrl: e.target.value,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Discord 서버 설정 → 연동 → 웹후크에서 생성할 수 있습니다
              </p>
            </div>
          )}
        </Card>

        {/* Slack Notifications */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">Slack 알림</h2>
              <p className="text-sm text-muted-foreground">
                Slack 채널로 알림을 받습니다
              </p>
            </div>
            <Switch
              checked={settings.slackEnabled}
              onCheckedChange={(checked: boolean) =>
                setSettings({ ...settings, slackEnabled: checked })
              }
            />
          </div>

          {settings.slackEnabled && (
            <div className="space-y-2">
              <Label htmlFor="slackWebhook">Slack Webhook URL</Label>
              <Input
                id="slackWebhook"
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={settings.slackWebhookUrl || ""}
                onChange={(e) =>
                  setSettings({ ...settings, slackWebhookUrl: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Slack 앱 관리 → Incoming Webhooks에서 생성할 수 있습니다
              </p>
            </div>
          )}
        </Card>

        {/* Notification Types */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4">알림 유형</h2>

          <div className="space-y-4">
            {/* Deadline Alerts */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">마감일 알림</p>
                <p className="text-sm text-muted-foreground">
                  지원사업 마감일이 다가올 때 알림을 받습니다
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Select
                  value={settings.deadlineAlertDays?.toString() || "7"}
                  onValueChange={(value) =>
                    setSettings({
                      ...settings,
                      deadlineAlertDays: parseInt(value),
                    })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1일 전</SelectItem>
                    <SelectItem value="3">3일 전</SelectItem>
                    <SelectItem value="7">7일 전</SelectItem>
                    <SelectItem value="14">14일 전</SelectItem>
                    <SelectItem value="30">30일 전</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Matching Results */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">매칭 결과 알림</p>
                <p className="text-sm text-muted-foreground">
                  새로운 매칭 결과가 있을 때 알림을 받습니다
                </p>
              </div>
              <Switch
                checked={settings.matchingResultEnabled}
                onCheckedChange={(checked: boolean) =>
                  setSettings({ ...settings, matchingResultEnabled: checked })
                }
              />
            </div>

            {/* Evaluation Complete */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">평가 완료 알림</p>
                <p className="text-sm text-muted-foreground">
                  사업계획서 평가가 완료되면 알림을 받습니다
                </p>
              </div>
              <Switch
                checked={settings.evaluationCompleteEnabled}
                onCheckedChange={(checked: boolean) =>
                  setSettings({
                    ...settings,
                    evaluationCompleteEnabled: checked,
                  })
                }
              />
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "설정 저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
