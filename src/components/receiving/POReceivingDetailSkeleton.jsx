import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton loader for PO receiving detail.
 * Shows immediately while backend query executes.
 */
export default function POReceivingDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded bg-gray-800" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 bg-gray-800" />
          <Skeleton className="h-4 w-72 bg-gray-800" />
        </div>
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <Card key={i} className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-3 text-center space-y-2">
              <Skeleton className="h-6 w-12 mx-auto bg-gray-800" />
              <Skeleton className="h-3 w-16 mx-auto bg-gray-800" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bar skeleton */}
      <Skeleton className="h-2 w-full rounded-full bg-gray-800" />

      {/* Actions bar skeleton */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-36 bg-gray-800" />
            <Skeleton className="h-8 w-24 bg-gray-800" />
            <Skeleton className="h-8 w-16 bg-gray-800" />
          </div>
        </CardContent>
      </Card>

      {/* Table skeleton */}
      <Card className="bg-gray-900/50 border-gray-700">
        <div className="px-4 py-3 border-b border-gray-700">
          <Skeleton className="h-4 w-32 bg-gray-800" />
        </div>
        <div className="p-2 space-y-1">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-4 bg-gray-800" />
              <Skeleton className="h-8 w-8 rounded bg-gray-800" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-40 bg-gray-800" />
                <Skeleton className="h-3 w-24 bg-gray-800" />
              </div>
              <Skeleton className="h-4 w-10 bg-gray-800" />
              <Skeleton className="h-4 w-10 bg-gray-800" />
              <Skeleton className="h-4 w-10 bg-gray-800" />
              <Skeleton className="h-8 w-20 bg-gray-800" />
              <Skeleton className="h-8 w-36 bg-gray-800" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}