/**
 * Companies Page Loading State
 */

import {
  PageHeaderSkeleton,
  CardSkeleton,
  ListItemSkeleton,
} from "@/components/ui/skeleton";

export default function CompaniesLoading() {
  return (
    <div className="container mx-auto space-y-6 py-8">
      <PageHeaderSkeleton />

      {/* Company List */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <ListItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
