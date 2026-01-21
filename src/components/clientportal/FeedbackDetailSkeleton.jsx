import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Skeleton for the metadata/action card
export function MetadataCardSkeleton() {
  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-24 bg-gray-700" />
            <Skeleton className="h-6 w-20 bg-gray-700" />
            <Skeleton className="h-6 w-28 bg-gray-700" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 bg-gray-700" />
            <Skeleton className="h-8 w-20 bg-gray-700" />
          </div>
        </div>
        <Skeleton className="h-16 w-full bg-gray-800/50 rounded-lg" />
        <div>
          <Skeleton className="h-4 w-24 bg-gray-700 mb-2" />
          <Skeleton className="h-10 w-full bg-gray-800/50 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

// Skeleton for the comment thread
export function ThreadSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-black/60 backdrop-blur-xl border border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-8 w-8 rounded-full bg-gray-700" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32 bg-gray-700" />
                <Skeleton className="h-3 w-24 bg-gray-700" />
              </div>
            </div>
            <Skeleton className="h-4 w-full bg-gray-700 mb-2" />
            <Skeleton className="h-4 w-3/4 bg-gray-700" />
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Skeleton className="h-32 w-full bg-gray-800 rounded-lg" />
              <Skeleton className="h-32 w-full bg-gray-800 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Skeleton for the comment form
export function CommentFormSkeleton() {
  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28 bg-gray-700" />
          <Skeleton className="h-8 w-40 bg-gray-800" />
        </div>
        <Skeleton className="h-24 w-full bg-gray-800 rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 bg-gray-700" />
          <Skeleton className="h-8 w-28 bg-gray-700" />
          <Skeleton className="h-8 w-16 bg-gray-700 ml-auto" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function FeedbackDetailSkeleton() {
  return (
    <div className="space-y-6">
      <MetadataCardSkeleton />
      <ThreadSkeleton />
      <CommentFormSkeleton />
    </div>
  );
}