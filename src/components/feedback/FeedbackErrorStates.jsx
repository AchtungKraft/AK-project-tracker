import React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCw, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotFoundState({ onBack, isMobile }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
      <div className="text-center space-y-3">
        <FileQuestion className="w-12 h-12 text-gray-500 mx-auto" />
        <p className="text-gray-400 text-lg">Request not found</p>
        <p className="text-gray-500 text-sm">This request may have been deleted or the link is incorrect.</p>
        {onBack && (
          <Button
            variant="outline"
            className="mt-4 border-gray-700 text-white"
            onClick={onBack}
          >
            Go Back
          </Button>
        )}
      </div>
    </div>
  );
}

export function RateLimitState({ onRetry, isRetrying, isMobile }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
      <div className="text-center space-y-3">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <p className="text-white text-lg">Temporary issue loading request</p>
        <p className="text-gray-400 text-sm">The server is busy. This usually resolves in a few seconds.</p>
        <Button
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-4 bg-amber-600 hover:bg-amber-700 text-white"
        >
          <RotateCw className={cn("w-4 h-4 mr-2", isRetrying && "animate-spin")} />
          {isRetrying ? "Retrying..." : "Retry"}
        </Button>
      </div>
    </div>
  );
}

export function UnknownErrorState({ message, onRetry, isRetrying, onBack }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
      <div className="text-center space-y-3">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <p className="text-white text-lg">Something went wrong</p>
        <p className="text-gray-400 text-sm">{message || "An unexpected error occurred."}</p>
        <div className="flex gap-3 justify-center mt-4">
          {onRetry && (
            <Button
              onClick={onRetry}
              disabled={isRetrying}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <RotateCw className={cn("w-4 h-4 mr-2", isRetrying && "animate-spin")} />
              {isRetrying ? "Retrying..." : "Retry"}
            </Button>
          )}
          {onBack && (
            <Button variant="outline" className="border-gray-700 text-white" onClick={onBack}>
              Go Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}