import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  preferred: { label: "⭐ Preferred", className: "border-amber-500/60 text-amber-400 bg-amber-900/20" },
  approved: { label: "✓ Approved", className: "border-green-600/50 text-green-400 bg-green-900/20" },
  probation: { label: "⚠ Probation", className: "border-orange-600/50 text-orange-400 bg-orange-900/20" },
  do_not_use: { label: "🚫 Do Not Use", className: "border-red-600/50 text-red-400 bg-red-900/20" },
  inactive: { label: "Inactive", className: "border-gray-600/50 text-gray-500 bg-gray-900/20" },
};

export default function VendorStatusBadge({ status, size = "sm" }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.approved;
  return (
    <Badge variant="outline" className={cn("text-[10px]", size === "lg" && "text-xs px-2.5 py-0.5", config.className)}>
      {config.label}
    </Badge>
  );
}