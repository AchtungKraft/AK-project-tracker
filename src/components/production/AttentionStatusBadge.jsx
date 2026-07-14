import React from "react";
import { cn } from "@/lib/utils";

/**
 * Prominent attention status badge — communicates management status at a glance.
 */
export default function AttentionStatusBadge({ attention, size = "md" }) {
  if (!attention) return null;

  const sizeClasses = size === "sm"
    ? "text-[9px] px-1.5 py-0"
    : "text-[10px] px-2 py-0.5";

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide border",
      sizeClasses,
      attention.color,
      attention.bgClass,
      attention.borderClass,
    )}>
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: attention.dot }}
      />
      {attention.label}
    </span>
  );
}