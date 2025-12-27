/**
 * Project Detail Page Loading State
 * Displayed while project workspace data is loading
 */

import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";

export default function ProjectDetailLoading() {
  return (
    <div className="container mx-auto py-8 space-y-6 max-w-5xl">
      {/* Back Navigation */}
      <Skeleton className="h-9 w-40" />

      {/* Project Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-96" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Progress Stepper Card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-2 mb-6">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        {/* Stepper */}
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <CardSkeleton />
    </div>
  );
}
