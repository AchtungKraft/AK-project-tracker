import React from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SyncConfidenceIndicator — Lightweight trust indicator for data freshness.
 * Shows when data was last fetched. Calm, subtle, non-intrusive.
 */
export default function SyncConfidenceIndicator({ dataUpdatedAt, isFetching, className }) {
  if (!dataUpdatedAt && !isFetching) return null;

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={cn("flex items-center gap-1.5 text-[10px]", className)}>
      {isFetching ? (
        <>
          <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
          <span className="text-blue-400">Updating…</span>
        </>
      ) : dataUpdatedAt ? (
        <>
          <CheckCircle2 className="w-3 h-3 text-gray-500" />
          <span className="text-gray-500">Updated {formatTime(dataUpdatedAt)}</span>
        </>
      ) : null}
    </div>
  );
}