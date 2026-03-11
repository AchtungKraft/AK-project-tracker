import React, { useState } from "react";
import { usePOReceivingView } from "@/components/supply/useProjectSupplyView";
import POReceivingList from "./POReceivingList";

/**
 * Loader wrapper for PO list mode.
 * Isolates the list query so it only fires when in list mode.
 */
export default function POReceivingListLoader() {
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');

  const { orders, summary, filterOptions, isLoading, refetch } = usePOReceivingView(null, {
    search: searchTerm,
    vendor_id: vendorFilter !== 'all' ? vendorFilter : undefined,
  });

  return (
    <POReceivingList
      orders={orders}
      summary={summary}
      filterOptions={filterOptions}
      isLoading={isLoading}
      onRefresh={() => refetch()}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      vendorFilter={vendorFilter}
      onVendorFilterChange={setVendorFilter}
    />
  );
}