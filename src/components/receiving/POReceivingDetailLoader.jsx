import React from "react";
import { usePOReceivingView } from "@/components/supply/useProjectSupplyView";
import POReceivingDetail from "./POReceivingDetail";
import POReceivingDetailSkeleton from "./POReceivingDetailSkeleton";

/**
 * Loader wrapper for PO detail mode.
 * Isolates the detail query so it only fires when in detail mode.
 * Shows skeleton immediately while data loads.
 */
export default function POReceivingDetailLoader({ orderId }) {
  const { po, locations, isLoading, refetch } = usePOReceivingView(orderId);

  if (isLoading) {
    return <POReceivingDetailSkeleton />;
  }

  return (
    <POReceivingDetail
      po={po}
      locations={locations}
      isLoading={false}
      refetch={refetch}
    />
  );
}