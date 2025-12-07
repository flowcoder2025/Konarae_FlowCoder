/**
 * Dashboard Loading State
 * Displayed while dashboard data is loading
 */

import {
  PageHeaderSkeleton,
  StatsCardSkeleton,
  CardSkeleton,
} from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="container mx-auto space-y-8 py-8">
      <PageHeaderSkeleton />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>

      {/* Recent Activity and Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Table */}
      <CardSkeleton />
    </div>
  );
}
