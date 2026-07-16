import React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared Project Type label — renders the canonical type name + color.
 * Used in Workload project headers and anywhere project type identification is needed.
 * Reuses the same color from the ProjectType entity used by the left navigation.
 */
export default function ProjectTypeLabel({ projectType, className }) {
  if (!projectType?.name) return null;

  return (
    <span
      className={cn(
        "text-[10px] font-bold uppercase tracking-wider shrink-0",
        className
      )}
      style={{ color: projectType.color || "#6B7280" }}
    >
      {projectType.name}
    </span>
  );
}