/**
 * Business Plans Page Loading State
 */

import {
  PageHeaderSkeleton,
  CardSkeleton,
  ListItemSkeleton,
} from "@/components/ui/skeleton";

export default function BusinessPlansLoading() {
  return (
    <div className="container mx-auto space-y-6 py-8 max-w-7xl">
      <PageHeaderSkeleton />

      {/* Business Plan List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
