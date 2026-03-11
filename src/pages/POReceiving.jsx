import React, { useState } from "react";
import POReceivingDetailLoader from "@/components/receiving/POReceivingDetailLoader";
import POReceivingListLoader from "@/components/receiving/POReceivingListLoader";

/**
 * POReceiving - PO-centric fast receiving page
 * 
 * Two modes:
 * 1. List mode: Shows all receivable POs (no order_id param)
 * 2. Detail mode: Shows single PO for batch receiving (order_id in URL)
 * 
 * Each mode renders a separate loader component to avoid firing both queries simultaneously.
 */
export default function POReceiving() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order_id');

  if (orderId) {
    return <POReceivingDetailLoader orderId={orderId} />;
  }

  return <POReceivingListLoader />;
}