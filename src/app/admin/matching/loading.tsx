import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminMatchingLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Company Summary Skeleton */}
      <Card>
        <div className="border-b p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-1 h-4 w-60" />
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20 ml-auto" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </Card>

      {/* Results Table Skeleton */}
      <Card>
        <div className="border-b p-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-1 h-4 w-48" />
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
