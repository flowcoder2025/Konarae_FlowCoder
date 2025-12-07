/**
 * Admin Dashboard Loading State
 */

import {
  PageHeaderSkeleton,
  StatsCardSkeleton,
  CardSkeleton,
} from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />

      {/* Statistics Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <div className="h-6 w-32 rounded bg-muted animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}
