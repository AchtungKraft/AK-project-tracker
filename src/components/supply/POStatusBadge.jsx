import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * POStatusBadge — Single source of truth for PO status rendering.
 * Use this everywhere a PO status is displayed.
 */

const STATUS_CONFIG = {
  Draft:     { bg: "bg-gray-500/20",  text: "text-gray-400",  border: "border-gray-500/30" },
  Ordered:   { bg: "bg-blue-500/20",  text: "text-blue-400",  border: "border-blue-500/30" },
  Partial:   { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
  Received:  { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
  Cancelled: { bg: "bg-red-500/20",   text: "text-red-400",   border: "border-red-500/30" },
};

export default function POStatusBadge({ status, size = "default", className }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.Draft;
  
  return (
    <Badge
      variant="outline"
      className={cn(
        config.bg, config.text, config.border,
        size === "lg" && "text-sm px-3 py-1",
        size === "sm" && "text-[10px] py-0",
        className
      )}
    >
      {status || "Unknown"}
    </Badge>
  );
}

export { STATUS_CONFIG };