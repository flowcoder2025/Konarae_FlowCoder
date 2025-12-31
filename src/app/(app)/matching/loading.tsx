/**
 * Matching Page Loading State
 */

import {
  PageHeaderSkeleton,
  FormSkeleton,
  CardSkeleton,
} from "@/components/ui/skeleton";

export default function MatchingLoading() {
  return (
    <div className="container mx-auto space-y-6 py-8 max-w-6xl">
      <PageHeaderSkeleton />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Matching Form */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-card p-6">
            <FormSkeleton fields={6} />
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}
