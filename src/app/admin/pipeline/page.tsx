/**
 * Admin Pipeline Management Page
 * Monitor and manage the crawling, parsing, and embedding pipeline
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PipelineStatsOverview,
  ParsePanel,
  EmbedPanel,
  PipelineSettingsPanel,
  PipelineJobsTable,
} from "@/components/admin/pipeline";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default function AdminPipelinePage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">파이프라인 관리</h1>
          <p className="mt-2 text-muted-foreground">
            크롤링 → 파싱 → 임베딩 파이프라인을 모니터링하고 관리합니다
          </p>
        </div>
        <Link href="/admin/crawler">
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            크롤러 관리
          </Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <PipelineStatsOverview />

      {/* Tabs */}
      <Tabs defaultValue="parse" className="space-y-6">
        <TabsList>
          <TabsTrigger value="parse">문서 파싱</TabsTrigger>
          <TabsTrigger value="embed">임베딩 생성</TabsTrigger>
          <TabsTrigger value="settings">자동화 설정</TabsTrigger>
          <TabsTrigger value="history">작업 이력</TabsTrigger>
        </TabsList>

        {/* Parse Tab */}
        <TabsContent value="parse" className="space-y-6">
          <ParsePanel />
        </TabsContent>

        {/* Embed Tab */}
        <TabsContent value="embed" className="space-y-6">
          <EmbedPanel />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <PipelineSettingsPanel />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <PipelineJobsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
