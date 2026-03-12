import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_PARTS = 2;

export default function POReceivingCard({ po, borderClass, onNavigate }) {
  const isPartial = po.total_qty_received > 0 && po.total_qty_remaining > 0;
  const isUntouched = po.total_qty_received === 0;
  const partNames = po.part_names || [];
  const visibleParts = partNames.slice(0, MAX_VISIBLE_PARTS);
  const extraCount = partNames.length - MAX_VISIBLE_PARTS;

  const received = po.total_qty_received || 0;
  const ordered = po.total_qty_ordered || 0;
  const remaining = po.total_qty_remaining || 0;
  const progressPct = ordered > 0 ? (received / ordered) * 100 : 0;

  return (
    <Card
      className={cn(
        "bg-gray-900/50 border-gray-700 hover:border-gray-500 cursor-pointer transition-colors border-l-4",
        borderClass || (isPartial ? "border-l-amber-500" : isUntouched ? "border-l-blue-500" : "border-l-green-500")
      )}
      onClick={() => onNavigate(po.order_id)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Row 1: Vendor + Qty Remaining */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Vendor — primary */}
            <div className="text-base font-semibold text-white truncate">
              {po.vendor_name}
            </div>

            {/* Part summary */}
            {visibleParts.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {visibleParts.map((name, i) => (
                  <div key={i} className="text-sm text-gray-400 truncate flex items-center gap-1.5">
                    <span className="text-gray-600">•</span>
                    {name}
                  </div>
                ))}
                {extraCount > 0 && (
                  <div className="text-xs text-gray-500 pl-3">
                    +{extraCount} more
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Qty remaining — large */}
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-bold text-green-400 leading-none">{remaining}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">to receive</div>
          </div>
        </div>

        {/* Row 2: Receiving context + meta */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span className="font-mono text-gray-400">{po.po_number}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] py-0",
              po.status === 'Ordered' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
              po.status === 'Partial' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
              po.status === 'Draft' && "bg-gray-500/20 text-gray-400 border-gray-500/30"
            )}>
              {po.status}
            </Badge>
            {po.order_number && (
              <span className="text-gray-600">Ref: {po.order_number}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 flex-shrink-0">
            <span className="text-gray-300 font-medium">{received}</span> of <span className="text-gray-300 font-medium">{ordered}</span> received
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300",
              isPartial ? "bg-amber-500" : progressPct >= 100 ? "bg-green-500" : "bg-blue-500"
            )}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}