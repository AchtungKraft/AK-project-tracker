import React from "react";
import { useSearchParams } from "react-router-dom";
import POReceivingDetailLoader from "@/components/receiving/POReceivingDetailLoader";
import POReceivingListLoader from "@/components/receiving/POReceivingListLoader";

/**
 * POReceiving - PO-centric fast receiving page
 * 
 * Two modes:
 * 1. List mode: Shows all receivable POs (no order_id param)
 * 2. Detail mode: Shows single PO for batch receiving (order_id in URL)
 * 
 * Uses useSearchParams for reactive URL tracking — ensures re-render on navigation.
 */
export default function POReceiving() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");

  if (orderId) {
    return <POReceivingDetailLoader orderId={orderId} />;
  }

  return <POReceivingListLoader />;
}