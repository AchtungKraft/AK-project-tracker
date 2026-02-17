import React from "react";
import BuildsDashboard from "@/components/parts/BuildsDashboard";

/**
 * SupplyInstalled Page - Route wrapper for BuildsDashboard component
 * STRICT: Reuses existing component in global mode, no new logic
 */
export default function SupplyInstalled() {
  return <BuildsDashboard globalMode={true} />;
}