import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * Visible error state for ClientPortalHub when data loading fails.
 * Never lets a backend failure masquerade as "No Feedback Requests."
 */
export default function HubErrorState({ error, onRetry }) {
  return (
    <Card className="bg-red-950/30 border border-red-700/50">
      <CardContent className="p-8 md:p-12 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-900/40 mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          Unable to Load Feedback Requests
        </h3>
        <p className="text-gray-400 mb-1 max-w-md mx-auto">
          The data service returned an error. Your requests still exist — this is a loading issue, not a data loss.
        </p>
        <p className="text-xs text-red-400/70 mb-6 font-mono max-w-lg mx-auto truncate">
          {error?.message || 'Unknown error'}
        </p>
        <Button
          onClick={onRetry}
          variant="outline"
          className="border-red-700 text-red-300 hover:bg-red-900/40 hover:text-white gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}