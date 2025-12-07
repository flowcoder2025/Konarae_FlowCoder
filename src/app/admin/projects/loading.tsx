/**
 * Admin Projects Loading State
 */

import { PageHeaderSkeleton, StatsCardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";

export default function AdminProjectsLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>
      <div className="rounded-lg border bg-card">
        <table className="w-full">
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRowSkeleton key={i} columns={7} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
