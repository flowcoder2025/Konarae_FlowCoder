/**
 * Evaluation Detail Page Loading State
 * Displayed while evaluation data is loading
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function EvaluationDetailLoading() {
  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Page Header */}
      <div className="space-y-4 mb-6">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>

      {/* Overall Score Card */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-20" />
          <div className="text-right space-y-1">
            <Skeleton className="h-10 w-16 ml-auto" />
            <Skeleton className="h-4 w-12 ml-auto" />
          </div>
        </div>
        <Skeleton className="h-2 w-full" />
      </Card>

      {/* Evaluation Criteria */}
      <Card className="p-6 mb-6">
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Card>

      {/* Feedbacks */}
      <div className="space-y-4 mb-6">
        <Skeleton className="h-6 w-32" />
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}
