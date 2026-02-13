import React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const ANALYTICS_URL = "https://akclient.base44.app/AnalyticsDashboard";

export default function PortalStatsEmbed() {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Header with external link option */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-white">Portal Stats</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(ANALYTICS_URL, "_blank")}
          className="gap-2 border-gray-700 text-gray-300 hover:text-white"
        >
          <ExternalLink className="w-4 h-4" />
          Open Full Analytics
        </Button>
      </div>
      
      {/* Embedded iframe */}
      <iframe
        src={`${ANALYTICS_URL}?embed=true`}
        className="w-full border-none flex-1"
        style={{ height: "calc(100vh - 120px)", minHeight: "500px" }}
        loading="lazy"
        title="Analytics Dashboard"
      />
    </div>
  );
}