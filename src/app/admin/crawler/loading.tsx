/**
 * Admin Crawler Page Loading State
 */

import {
  PageHeaderSkeleton,
  CardSkeleton,
  TableRowSkeleton,
} from "@/components/ui/skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminCrawlerLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />

      {/* Crawl Sources */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>

      {/* Recent Jobs */}
      <div>
        <Skeleton className="h-7 w-32 mb-4" />

        <div className="rounded-lg border bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left">
                  <Skeleton className="h-4 w-16" />
                </th>
                <th className="p-4 text-left">
                  <Skeleton className="h-4 w-16" />
                </th>
                <th className="p-4 text-left">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="p-4 text-left">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="p-4 text-right">
                  <Skeleton className="h-4 w-24" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
