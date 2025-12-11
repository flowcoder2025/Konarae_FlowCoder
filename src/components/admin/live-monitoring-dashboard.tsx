"use client";

/**
 * Live Monitoring Dashboard
 * Real-time system and crawler status monitoring
 */

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Activity,
  Database,
  Server,
  Calendar,
  Loader2,
  Play,
  Pause,
  Wifi,
  WifiOff,
} from "lucide-react";

// Types
interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latency?: number;
  message?: string;
  url?: string;
  lastChecked: string;
}

interface SystemStatusData {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  services: ServiceStatus[];
  database: ServiceStatus;
  crawler: {
    totalJobs: number;
    runningJobs: number;
    completedToday: number;
    failedToday: number;
    pendingJobs: number;
    lastSuccessfulCrawl?: string;
    avgDuration?: number;
  };
  scheduler: {
    type: "vercel-cron" | "qstash" | "none";
    schedules: number;
    status: "active" | "inactive" | "error";
  };
}

interface RunningJob {
  id: string;
  sourceName: string;
  sourceUrl: string;
  status: string;
  startedAt: string | null;
  duration: number | null;
  projectsFound: number;
  projectsNew: number;
  projectsUpdated: number;
}

interface RecentJob {
  id: string;
  sourceName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  projectsFound: number;
  projectsNew: number;
  projectsUpdated: number;
  errorMessage: string | null;
}

interface LiveStatusData {
  timestamp: string;
  runningJobs: RunningJob[];
  recentJobs: RecentJob[];
  summary: {
    totalSources: number;
    activeSources: number;
    runningJobs: number;
    pendingJobs: number;
    completedToday: number;
    failedToday: number;
  };
}

// Status helpers
const getStatusIcon = (status: string) => {
  switch (status) {
    case "healthy":
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "down":
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "degraded":
    case "running":
      return <Activity className="h-4 w-4 text-yellow-500" />;
    case "pending":
      return <Clock className="h-4 w-4 text-blue-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "healthy":
    case "completed":
    case "active":
      return "default";
    case "degraded":
    case "running":
      return "secondary";
    case "down":
    case "failed":
    case "error":
      return "destructive";
    default:
      return "outline";
  }
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return "-";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

const formatRelativeTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
};

// Components
function StatusCard({
  title,
  value,
  subtitle,
  icon,
  status,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  status?: "healthy" | "degraded" | "down" | "unknown" | "default";
}) {
  const bgColor = {
    healthy: "border-green-500/20 bg-green-500/5",
    degraded: "border-yellow-500/20 bg-yellow-500/5",
    down: "border-red-500/20 bg-red-500/5",
    unknown: "border-gray-500/20 bg-gray-500/5",
    default: "",
  }[status || "default"];

  return (
    <Card className={`p-4 ${bgColor}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </Card>
  );
}

function ServiceStatusRow({ service }: { service: ServiceStatus }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        {getStatusIcon(service.status)}
        <span className="font-medium">{service.name}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {service.latency && <span>{service.latency}ms</span>}
        <Badge variant={getStatusBadgeVariant(service.status)}>{service.status}</Badge>
      </div>
    </div>
  );
}

function RunningJobCard({ job }: { job: RunningJob }) {
  return (
    <Card className="p-4 border-yellow-500/20 bg-yellow-500/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
          <span className="font-medium">{job.sourceName}</span>
        </div>
        <Badge variant="secondary">실행 중</Badge>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">경과:</span>{" "}
          <span className="font-medium">{formatDuration(job.duration)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">발견:</span>{" "}
          <span className="font-medium">{job.projectsFound}</span>
        </div>
        <div>
          <span className="text-muted-foreground">신규:</span>{" "}
          <span className="font-medium text-green-600">{job.projectsNew}</span>
        </div>
        <div>
          <span className="text-muted-foreground">업데이트:</span>{" "}
          <span className="font-medium text-blue-600">{job.projectsUpdated}</span>
        </div>
      </div>
    </Card>
  );
}

function RecentJobRow({ job }: { job: RecentJob }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 pr-4">{job.sourceName}</td>
      <td className="py-2 pr-4">
        <Badge variant={getStatusBadgeVariant(job.status)}>
          {job.status === "completed" ? "완료" : job.status === "failed" ? "실패" : job.status}
        </Badge>
      </td>
      <td className="py-2 pr-4 text-sm text-muted-foreground">
        {formatRelativeTime(job.completedAt || job.startedAt)}
      </td>
      <td className="py-2 pr-4 text-sm">{formatDuration(job.duration)}</td>
      <td className="py-2 text-sm text-right">
        {job.status === "failed" && job.errorMessage ? (
          <span className="text-red-500 truncate max-w-[200px]" title={job.errorMessage}>
            {job.errorMessage.substring(0, 30)}...
          </span>
        ) : (
          `${job.projectsFound} / ${job.projectsNew} / ${job.projectsUpdated}`
        )}
      </td>
    </tr>
  );
}

// Main Component
export function LiveMonitoringDashboard() {
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [systemRes, liveRes] = await Promise.all([
        fetch("/api/admin/system-status"),
        fetch("/api/admin/crawler/live-status"),
      ]);

      if (!systemRes.ok || !liveRes.ok) {
        throw new Error("Failed to fetch status data");
      }

      const [systemData, liveData] = await Promise.all([
        systemRes.json(),
        liveRes.json(),
      ]);

      setSystemStatus(systemData);
      setLiveStatus(liveData);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    let interval: NodeJS.Timeout | null = null;
    if (isAutoRefresh) {
      interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchData, isAutoRefresh]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">모니터링 데이터 로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-500/20 bg-red-500/5">
        <div className="flex items-center gap-2 text-red-500">
          <XCircle className="h-5 w-5" />
          <span className="font-medium">모니터링 오류</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button onClick={fetchData} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          다시 시도
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAutoRefresh ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-gray-500" />
          )}
          <span className="text-sm text-muted-foreground">
            {isAutoRefresh ? "실시간 모니터링 활성" : "자동 새로고침 일시정지"}
          </span>
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              (마지막 업데이트: {lastUpdate.toLocaleTimeString("ko-KR")})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
          >
            {isAutoRefresh ? (
              <>
                <Pause className="h-4 w-4 mr-1" />
                일시정지
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                재개
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            새로고침
          </Button>
        </div>
      </div>

      {/* System Overview */}
      {systemStatus && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatusCard
              title="시스템 상태"
              value={
                systemStatus.status === "healthy"
                  ? "정상"
                  : systemStatus.status === "degraded"
                  ? "저하"
                  : "장애"
              }
              icon={<Server className="h-4 w-4" />}
              status={systemStatus.status}
            />
            <StatusCard
              title="데이터베이스"
              value={
                systemStatus.database.status === "healthy"
                  ? "연결됨"
                  : "연결 안됨"
              }
              subtitle={
                systemStatus.database.latency
                  ? `${systemStatus.database.latency}ms`
                  : undefined
              }
              icon={<Database className="h-4 w-4" />}
              status={systemStatus.database.status}
            />
            <StatusCard
              title="스케줄러"
              value={
                systemStatus.scheduler.type === "vercel-cron"
                  ? "Vercel Cron"
                  : systemStatus.scheduler.type === "qstash"
                  ? "QStash"
                  : "미설정"
              }
              subtitle={`${systemStatus.scheduler.schedules}개 스케줄`}
              icon={<Calendar className="h-4 w-4" />}
              status={
                systemStatus.scheduler.status === "active"
                  ? "healthy"
                  : "degraded"
              }
            />
            <StatusCard
              title="실행 중인 작업"
              value={liveStatus?.summary.runningJobs || 0}
              subtitle={`대기 중: ${liveStatus?.summary.pendingJobs || 0}`}
              icon={<Activity className="h-4 w-4" />}
            />
          </div>

          {/* Service Status */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">서비스 상태</h3>
            <div className="space-y-1">
              <ServiceStatusRow service={systemStatus.database} />
              {systemStatus.services.map((service, idx) => (
                <ServiceStatusRow key={idx} service={service} />
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Running Jobs */}
      {liveStatus && liveStatus.runningJobs.length > 0 && (
        <div>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            실행 중인 크롤링 작업
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {liveStatus.runningJobs.map((job) => (
              <RunningJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Today's Summary */}
      {liveStatus && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatusCard
            title="오늘 완료"
            value={liveStatus.summary.completedToday}
            icon={<CheckCircle className="h-4 w-4 text-green-500" />}
          />
          <StatusCard
            title="오늘 실패"
            value={liveStatus.summary.failedToday}
            icon={<XCircle className="h-4 w-4 text-red-500" />}
            status={liveStatus.summary.failedToday > 0 ? "degraded" : undefined}
          />
          <StatusCard
            title="활성 소스"
            value={`${liveStatus.summary.activeSources} / ${liveStatus.summary.totalSources}`}
            icon={<Server className="h-4 w-4" />}
          />
          <StatusCard
            title="평균 소요시간"
            value={formatDuration(systemStatus?.crawler.avgDuration)}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Recent Jobs */}
      {liveStatus && liveStatus.recentJobs.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">최근 작업 이력</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">소스</th>
                  <th className="py-2 pr-4 font-medium">상태</th>
                  <th className="py-2 pr-4 font-medium">시간</th>
                  <th className="py-2 pr-4 font-medium">소요</th>
                  <th className="py-2 font-medium text-right">결과 (발견/신규/업데이트)</th>
                </tr>
              </thead>
              <tbody>
                {liveStatus.recentJobs.slice(0, 10).map((job) => (
                  <RecentJobRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
