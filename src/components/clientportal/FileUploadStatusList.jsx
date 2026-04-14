import React from "react";
import { X, Loader2, CheckCircle2, AlertCircle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FileUploadStatusList — renders per-file status for a useFileUploader instance.
 * 
 * Props:
 *   files       — from useFileUploader().files
 *   onRemove    — (local_id) => void
 *   onRetry     — () => void  (retries all failed)
 *   mode        — "image" | "file" (controls preview rendering)
 *   compact     — boolean
 */
export default function FileUploadStatusList({ files, onRemove, onRetry, mode = "image", compact = false }) {
  if (!files || files.length === 0) return null;

  const failedCount = files.filter(f => f.status === "failed").length;

  return (
    <div className="space-y-2">
      {mode === "image" ? (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {files.map((f) => (
            <div key={f.local_id} className="relative group">
              <div className={cn(
                "w-full h-20 bg-gray-800 rounded-lg border flex items-center justify-center overflow-hidden",
                f.status === "failed" ? "border-red-500/50" : "border-gray-700"
              )}>
                {f.status === "uploaded" && f.result_url ? (
                  <img src={f.result_url} alt={f.name} loading="lazy" className="max-w-full max-h-full object-contain" />
                ) : f.status === "uploading" || f.status === "queued" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                ) : f.status === "failed" ? (
                  <div className="flex flex-col items-center gap-1">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-[9px] text-red-400 text-center px-1 leading-tight">{f.error_message || "Failed"}</span>
                  </div>
                ) : null}
              </div>
              {/* Status indicator */}
              {f.status === "uploaded" && (
                <div className="absolute top-1 left-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 drop-shadow" />
                </div>
              )}
              {/* Remove button */}
              <button
                type="button"
                onClick={() => onRemove(f.local_id)}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.local_id} className={cn(
              "flex items-center justify-between p-2 bg-gray-800 rounded-lg",
              f.status === "failed" ? "border border-red-500/50" : ""
            )}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {f.status === "uploading" || f.status === "queued" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                ) : f.status === "uploaded" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                ) : f.status === "failed" ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : null}
                <span className="text-white text-sm truncate">{f.name}</span>
                {f.status === "failed" && f.error_message && (
                  <span className="text-xs text-red-400 shrink-0">— {f.error_message}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(f.local_id)}
                className="text-red-400 hover:text-red-300 p-1 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Retry all failed */}
      {failedCount > 0 && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          <RotateCw className="w-3 h-3" />
          Retry {failedCount} failed upload{failedCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}