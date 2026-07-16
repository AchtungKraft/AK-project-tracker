import React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared Project Type label — renders the canonical type name + color.
 * Used in Workload project headers and anywhere project type identification is needed.
 * Reuses the same color from the ProjectType entity used by the left navigation.
 */
export default function ProjectTypeLabel({ projectType, variant, className }) {
  if (!projectType?.name) return null;

  const isMobileMetadata = variant === "mobileMetadata";

  return (
    <span
      className={cn(
        "font-bold uppercase tracking-wider shrink-0",
        isMobileMetadata ? "text-[9px]" : "text-[10px]",
        className
      )}
      style={{ color: projectType.color || "#6B7280" }}
    >
      {projectType.name}
    </span>
  );
}