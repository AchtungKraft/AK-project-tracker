import React from "react";
import OnOrder from "@/components/parts/OnOrder";

/**
 * SupplyOnOrder Page - Route wrapper for OnOrder component
 * STRICT: Reuses existing component in global mode, no new logic
 */
export default function SupplyOnOrder() {
  return <OnOrder globalMode={true} />;
}