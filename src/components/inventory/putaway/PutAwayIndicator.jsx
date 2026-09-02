import React, { useMemo } from "react";
import { PackageOpen, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { findReceivingLocation } from "@/lib/receivingLocationResolver";

/**
 * PutAwayIndicator — compact card for StorageHome showing items awaiting put-away.
 */
export default function PutAwayIndicator({ locations, inventoryItems, onClick }) {
  const { lineCount, totalUnits } = useMemo(() => {
    const rcv = findReceivingLocation(locations);
    if (!rcv) return { lineCount: 0, totalUnits: 0 };

    const items = inventoryItems.filter(
      i => i.location_id === rcv.id && (i.quantity_on_hand || 0) > 0
    );
    return {
      lineCount: items.length,
      totalUnits: items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
    };
  }, [locations, inventoryItems]);

  if (lineCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-xl border border-green-800/40 bg-green-950/20 hover:bg-green-950/30 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center shrink-0">
        <PackageOpen className="w-5 h-5 text-green-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">Put Away</div>
        <div className="text-xs text-gray-400">
          {lineCount} line{lineCount !== 1 ? 's' : ''} · {totalUnits} units in Receiving
        </div>
      </div>
      <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
        {lineCount}
      </Badge>
      <ArrowRight className="w-4 h-4 text-gray-500" />
    </button>
  );
}