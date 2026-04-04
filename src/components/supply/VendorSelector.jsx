import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Search, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VendorSelector — Step 1 of Vendor PO Builder.
 * Displays vendors with counts of orderable parts.
 */
export default function VendorSelector({ onSelectVendor, vendorType = "PART" }) {
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Fetch grouped vendors from backend
  const { data: groupedData, isLoading: loading } = useQuery({
    queryKey: ['vendorsGrouped', vendorType],
    queryFn: async () => {
      const res = await base44.functions.invoke('getVendorsGrouped', { vendor_type: vendorType });
      return res.data;
    },
    staleTime: 300000,
    gcTime: 600000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const groups = groupedData?.groups || [];

  // Apply search filter within groups
  const filteredGroups = groups
    .map(g => ({
      ...g,
      vendors: g.vendors.filter(v =>
        !search || v.vendor_name?.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(g => g.vendors.length > 0);

  const toggleGroup = (groupId) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

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

      <div className="space-y-4">
        {filteredGroups.map(group => {
          const isCollapsed = collapsedGroups[group.group_id || 'ungrouped'];
          return (
            <div key={group.group_id || 'ungrouped'}>
              <button
                onClick={() => toggleGroup(group.group_id || 'ungrouped')}
                className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors w-full text-left"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span>{group.group_name}</span>
                <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-700">
                  {group.vendors.length}
                </Badge>
              </button>
              {!isCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 ml-6">
                  {group.vendors.map(v => (
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
              )}
            </div>
          );
        })}
      </div>

      {filteredGroups.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No vendors found</p>
        </div>
      )}
    </div>
  );
}