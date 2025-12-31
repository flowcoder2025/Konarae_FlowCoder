import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CompanyMatchingLoading() {
  return (
    <div className="container mx-auto py-8 max-w-6xl">
      {/* Back Link */}
      <Skeleton className="h-5 w-48 mb-6" />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-5 w-48" />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-12" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filters */}
      <Skeleton className="h-10 w-full mb-6" />

      {/* Results Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-6 w-64" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-12 w-12" />
              </div>
              <Skeleton className="h-12 w-full" />
              <div className="space-y-2">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
