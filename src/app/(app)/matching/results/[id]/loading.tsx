/**
 * Match Result Detail Page Loading State
 * Displayed while match result data is loading
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function MatchResultDetailLoading() {
  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Page Header */}
      <div className="space-y-4 mb-6">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-96" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>

      {/* Overall Score Card */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <div className="text-right space-y-1">
            <Skeleton className="h-10 w-16 ml-auto" />
            <Skeleton className="h-4 w-12 ml-auto" />
          </div>
        </div>
        <Skeleton className="h-2 w-full" />
      </Card>

      {/* Score Breakdown Card */}
      <Card className="p-6 mb-6">
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-64 mt-1" />
            </div>
          ))}
        </div>
      </Card>

      {/* Match Reasons Card */}
      <Card className="p-6 mb-6">
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </Card>

      {/* Project Details Card */}
      <Card className="p-6 mb-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-40" />
            </div>
          ))}
        </div>
      </Card>

      {/* Summary Card */}
      <Card className="p-6 mb-6">
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <div className="flex gap-4">
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="h-12 flex-1" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
