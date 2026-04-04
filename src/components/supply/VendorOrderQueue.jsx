import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2, Package, DollarSign, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCurrency(val) {
  if (!val) return "$0";
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

export default function VendorOrderQueue({ onSelectVendor }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getVendorOrderQueue", {});
        setQueue(res.data?.queue || []);
      } catch (err) {
        console.error("VendorOrderQueue fetch error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading order queue...
      </div>
    );
  }

  if (queue.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Vendors Needing Orders
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 ml-1">
            {queue.length}
          </Badge>
        </h3>
      </div>

      <div className="border border-gray-800 rounded-lg overflow-hidden bg-black/30">
        {queue.map((v, idx) => (
          <button
            key={v.vendor_id}
            onClick={() => onSelectVendor({ id: v.vendor_id, vendor_name: v.vendor_name, color: v.color })}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-800/60",
              idx !== queue.length - 1 && "border-b border-gray-800/60"
            )}
          >
            {/* Color dot */}
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: v.color || "#3B82F6" }}
            />

            {/* Vendor name + group */}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-white truncate block">{v.vendor_name}</span>
              {v.group_name && (
                <span className="text-[10px] text-gray-500 truncate block">{v.group_name}</span>
              )}
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
              <span className="text-gray-400 flex items-center gap-1">
                <Package className="w-3 h-3" />
                {v.parts_count}
              </span>
              <span className="text-emerald-400 flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                {formatCurrency(v.total_value)}
              </span>
              {v.urgent_count > 0 && (
                <Badge className="bg-red-900/50 text-red-400 border-red-700/40 text-[9px] px-1.5 py-0">
                  {v.urgent_count} urgent
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}