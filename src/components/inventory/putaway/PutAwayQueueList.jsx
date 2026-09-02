import React, { useMemo, useState, useCallback } from "react";
import { 
  PackageOpen, Package, Inbox, Minus, Plus, ScanLine, Search 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { findReceivingLocation } from "@/lib/receivingLocationResolver";

/**
 * PutAwayQueueList — shows all inventory at RECEIVING, with multi-select + qty controls.
 *
 * Props:
 *   locations, inventoryItems, parts, orders, lineItems, projects, commitments
 *   onStartPutAway(selected: Map<invItemId, { qty, invItem, part }>) — trigger the move workflow
 */
export default function PutAwayQueueList({
  locations, inventoryItems, parts, orders = [], lineItems = [], projects = [], commitments = [],
  onStartPutAway,
}) {
  const [selected, setSelected] = useState(new Map());
  const [searchTerm, setSearchTerm] = useState('');

  const receivingLoc = useMemo(() => findReceivingLocation(locations), [locations]);

  // Build enriched queue items
  const queueItems = useMemo(() => {
    if (!receivingLoc) return [];

    const partsMap = new Map(parts.map(p => [p.id, p]));
    
    // Build PO/receipt context maps
    const partOrderMap = new Map();
    lineItems.forEach(li => {
      if (!partOrderMap.has(li.part_id)) partOrderMap.set(li.part_id, []);
      partOrderMap.get(li.part_id).push(li);
    });
    const ordersMap = new Map(orders.map(o => [o.id, o]));

    // Build project context from commitments
    const partProjectMap = new Map();
    commitments.forEach(c => {
      if ((c.required_total || 0) > 0 && c.project_id) {
        if (!partProjectMap.has(c.part_id)) partProjectMap.set(c.part_id, []);
        partProjectMap.get(c.part_id).push(c.project_id);
      }
    });

    const items = inventoryItems
      .filter(i => i.location_id === receivingLoc.id && (i.quantity_on_hand || 0) > 0)
      .map(i => {
        const part = partsMap.get(i.part_id);
        if (!part) return null;

        // Find matching PO line
        const poLines = partOrderMap.get(i.part_id) || [];
        const matchedLine = poLines.find(li => li.order_id === i.purchase_order_id) || poLines[0];
        const order = matchedLine ? ordersMap.get(matchedLine.order_id) : null;

        // Project context
        const projectIds = partProjectMap.get(i.part_id) || [];
        const project = projectIds.length > 0 ? projects.find(p => p.id === projectIds[0]) : null;

        return {
          id: i.id,
          invItem: i,
          part,
          qty: i.quantity_on_hand,
          reserved: i.quantity_reserved || 0,
          receivedDate: i.received_date || i.created_date,
          receiptId: i.receipt_id,
          purchaseOrderId: i.purchase_order_id,
          poNumber: order?.po_number,
          vendorName: null, // enriched from vendor if needed
          project,
          sourceType: i.source_type,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        // Newest first
        const da = a.receivedDate || '';
        const db = b.receivedDate || '';
        return db.localeCompare(da);
      });

    return items;
  }, [receivingLoc, inventoryItems, parts, lineItems, orders, commitments, projects]);

  // Filter
  const filteredItems = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return queueItems;
    const term = searchTerm.toLowerCase();
    return queueItems.filter(item =>
      item.part.part_name?.toLowerCase().includes(term) ||
      item.part.vendor_part_number?.toLowerCase().includes(term) ||
      item.poNumber?.toLowerCase().includes(term)
    );
  }, [queueItems, searchTerm]);

  const handleToggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        const item = queueItems.find(q => q.id === id);
        if (item) {
          const avail = item.qty - item.reserved;
          next.set(id, { qty: avail, invItem: item.invItem, part: item.part });
        }
      }
      return next;
    });
  }, [queueItems]);

  const handleSetQty = useCallback((id, qty) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (qty <= 0) {
        next.delete(id);
      } else {
        const existing = next.get(id);
        if (existing) next.set(id, { ...existing, qty });
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const next = new Map();
    filteredItems.forEach(item => {
      const avail = item.qty - item.reserved;
      if (avail > 0) next.set(item.id, { qty: avail, invItem: item.invItem, part: item.part });
    });
    setSelected(next);
  }, [filteredItems]);

  const handleDeselectAll = useCallback(() => setSelected(new Map()), []);

  const selectedCount = selected.size;
  const selectedPieces = Array.from(selected.values()).reduce((s, v) => s + v.qty, 0);

  // Empty state
  if (queueItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-green-950/30 flex items-center justify-center mb-4">
          <PackageOpen className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">All Put Away</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          No inventory waiting in Receiving. Items appear here after PO receiving.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search + quick actions */}
      <div className="px-3 py-2 space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search parts or PO…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {filteredItems.length} line{filteredItems.length !== 1 ? 's' : ''} in Receiving
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={handleSelectAll} className="h-7 text-xs text-gray-400">
              Select All
            </Button>
            {selectedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={handleDeselectAll} className="h-7 text-xs text-gray-400">
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-24">
        {filteredItems.map(item => {
          const isSelected = selected.has(item.id);
          const sel = selected.get(item.id);
          const available = item.qty - item.reserved;
          const moveQty = sel?.qty || 0;
          const photo = item.part.featured_photo || item.part.photos?.[0];

          return (
            <div key={item.id}
              className={cn(
                "rounded-lg border transition-all",
                isSelected ? "bg-green-950/20 border-green-800/50" : "bg-gray-900/30 border-gray-800"
              )}
            >
              <button className="flex items-center gap-3 p-3 w-full text-left" onClick={() => handleToggle(item.id)}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleToggle(item.id)}
                  className="shrink-0 h-5 w-5 border-gray-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                  onClick={(e) => e.stopPropagation()}
                />
                {photo ? (
                  <img src={photo} alt="" className="w-10 h-10 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-gray-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm text-white font-medium truncate">{item.part.part_name}</h4>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.part.vendor_part_number && (
                      <span className="text-xs font-mono text-gray-500">{item.part.vendor_part_number}</span>
                    )}
                    {item.poNumber && (
                      <Badge variant="outline" className="text-[10px] border-blue-700/50 text-blue-400 px-1.5 py-0">
                        {item.poNumber}
                      </Badge>
                    )}
                    {item.project && (
                      <Badge variant="outline" className="text-[10px] border-purple-700/50 text-purple-400 px-1.5 py-0">
                        {item.project.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-white">{available}</div>
                  <div className="text-[10px] text-gray-500">avail</div>
                </div>
              </button>

              {/* Quantity controls */}
              {isSelected && available > 0 && (
                <div className="flex items-center gap-3 px-3 pb-3">
                  <span className="text-xs text-gray-400 shrink-0">Put away:</span>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8 border-gray-700 text-gray-300"
                      disabled={moveQty <= 1} onClick={() => handleSetQty(item.id, Math.max(1, moveQty - 1))}>
                      <Minus className="w-4 h-4" />
                    </Button>
                    <input type="number" min={1} max={available} value={moveQty}
                      onChange={(e) => handleSetQty(item.id, Math.min(available, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-14 h-8 text-center bg-gray-800 border border-gray-700 rounded text-white text-sm font-semibold"
                    />
                    <Button size="icon" variant="outline" className="h-8 w-8 border-gray-700 text-gray-300"
                      disabled={moveQty >= available} onClick={() => handleSetQty(item.id, Math.min(available, moveQty + 1))}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {available > 1 && moveQty < available && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-white"
                      onClick={() => handleSetQty(item.id, available)}>
                      All ({available})
                    </Button>
                  )}
                  <span className="text-xs text-gray-500 ml-auto">of {available}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky action bar */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/80 backdrop-blur shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <Button
          onClick={() => onStartPutAway(selected)}
          disabled={selectedCount === 0}
          className="w-full h-14 text-lg gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-800 disabled:text-gray-500"
        >
          <PackageOpen className="w-5 h-5" />
          {selectedCount > 0
            ? `Put Away ${selectedCount} item${selectedCount !== 1 ? 's' : ''} · ${selectedPieces} pieces`
            : 'Select items to put away'}
        </Button>
      </div>
    </div>
  );
}