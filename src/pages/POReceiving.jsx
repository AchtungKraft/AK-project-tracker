import React, { useState } from "react";
import { usePOReceivingView } from "@/components/supply/useProjectSupplyView";
import POReceivingList from "@/components/receiving/POReceivingList";
import POReceivingDetail from "@/components/receiving/POReceivingDetail";

/**
 * POReceiving - PO-centric fast receiving page
 * 
 * Two modes:
 * 1. List mode: Shows all receivable POs (no order_id param)
 * 2. Detail mode: Shows single PO for batch receiving (order_id in URL)
 */
export default function POReceiving() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order_id');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');

  const listView = usePOReceivingView(null, { 
    search: searchTerm, 
    vendor_id: vendorFilter !== 'all' ? vendorFilter : undefined 
  });
  const detailView = usePOReceivingView(orderId);

  if (orderId) {
    return (
      <POReceivingDetail 
        po={detailView.po} 
        locations={detailView.locations}
        isLoading={detailView.isLoading}
        refetch={detailView.refetch}
      />
    );
  }

  return (
    <POReceivingList
      orders={listView.orders}
      summary={listView.summary}
      filterOptions={listView.filterOptions}
      isLoading={listView.isLoading}
      onRefresh={() => listView.refetch()}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      vendorFilter={vendorFilter}
      onVendorFilterChange={setVendorFilter}
    />
  );
}