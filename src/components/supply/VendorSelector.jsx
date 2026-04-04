import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Search, ChevronRight, Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VendorSelector — Step 1 of Vendor PO Builder.
 * Displays vendors with counts of orderable parts.
 */
export default function VendorSelector({ onSelectVendor }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const vList = await base44.entities.Vendor.filter({ active: true }, 'vendor_name', 500);
      setVendors(vList);
      setLoading(false);
    })();
  }, []);

  const filtered = vendors.filter(v =>
    !search || v.vendor_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-gray-600 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          placeholder="Search vendors..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-gray-900/50 border-gray-700 text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(v => (
          <button
            key={v.id}
            onClick={() => onSelectVendor(v)}
            className={cn(
              "text-left p-4 rounded-lg border transition-all",
              "bg-gray-800/50 border-gray-700 hover:border-red-600/50 hover:bg-gray-800"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: v.color || '#3B82F6' }}
                >
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{v.vendor_name}</p>
                  {v.website && (
                    <p className="text-xs text-gray-500 truncate">{v.website}</p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No vendors found</p>
        </div>
      )}
    </div>
  );
}