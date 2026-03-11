import React from "react";
import { useSearchParams } from "react-router-dom";
import POReceivingDetailLoader from "@/components/receiving/POReceivingDetailLoader";
import POReceivingListLoader from "@/components/receiving/POReceivingListLoader";

/**
 * POReceiving - PO-centric fast receiving page
 * 
 * Two modes:
 * 1. List mode (no order_id param): Shows summary-only PO cards.
 *    Backend returns slim order-level data — NO per-line objects.
 * 2. Detail mode (order_id in URL): Shows single PO with full line-level
 *    detail for batch receiving.
 * 
 * Uses useSearchParams for reactive URL tracking — ensures re-render on navigation.
 * Navigation: list→detail via navigate(), detail→list via navigate() + cache invalidation.
 */
export default function POReceiving() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");

  if (orderId) {
    return <POReceivingDetailLoader orderId={orderId} />;
  }

  return <POReceivingListLoader />;
}