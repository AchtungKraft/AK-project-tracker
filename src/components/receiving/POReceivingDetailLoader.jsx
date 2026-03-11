import React from "react";
import { usePOReceivingView } from "@/components/supply/useProjectSupplyView";
import POReceivingDetail from "./POReceivingDetail";

/**
 * Loader wrapper for PO detail mode.
 * Isolates the detail query so it only fires when in detail mode.
 */
export default function POReceivingDetailLoader({ orderId }) {
  const { po, locations, isLoading, refetch } = usePOReceivingView(orderId);

  return (
    <POReceivingDetail
      po={po}
      locations={locations}
      isLoading={isLoading}
      refetch={refetch}
    />
  );
}