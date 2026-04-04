import React, { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Package } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * AddManualPOLineModal — Lets users add any part to a vendor PO,
 * even without system demand. Searches all parts and their vendor sources.
 */
export default function AddManualPOLineModal({ vendor, existingPartIds, onAdd, onClose }) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);

  // Fetch all parts and vendor sources for this vendor
  const { data: parts = [] } = useQuery({
    queryKey: ["parts-for-manual-po"],
    queryFn: () => base44.entities.Part.filter({ is_active: true, is_archived: false }),
    staleTime: 60000,
  });

  const { data: vendorSources = [] } = useQuery({
    queryKey: ["vendor-sources-for-po", vendor.id],
    queryFn: () => base44.entities.PartVendorSource.filter({ vendor_id: vendor.id, is_active: true }),
    staleTime: 60000,
  });

  const sourcesByPart = useMemo(() => {
    const map = {};
    for (const s of vendorSources) {
      if (!map[s.part_id]) map[s.part_id] = [];
      map[s.part_id].push(s);
    }
    return map;
  }, [vendorSources]);

  // Filter parts by search and exclude already-added parts
  const filteredParts = useMemo(() => {
    const existing = new Set(existingPartIds || []);
    return parts.filter(p => {
      if (existing.has(p.id)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return p.part_name?.toLowerCase().includes(q) ||
        p.vendor_part_number?.toLowerCase().includes(q);
    }).slice(0, 50);
  }, [parts, search, existingPartIds]);

  const handleSelectPart = (part) => {
    setSelectedPart(part);
    const sources = sourcesByPart[part.id] || [];
    const preferred = sources.find(s => s.is_preferred) || sources[0] || null;
    setSelectedSource(preferred);
    setQty(1);
  };

  const handleConfirm = () => {
    if (!selectedPart) return;
    const source = selectedSource;
    const unitCost = source?.unit_cost || selectedPart.cost || 0;

    onAdd({
      commitment_id: null, // manual line — no commitment
      part_id: selectedPart.id,
      part_name: selectedPart.part_name,
      project_name: "Manual",
      qty: qty,
      qty_requested: 0,
      unit_cost: unitCost,
      source_id: source?.id || null,
      vendor_sources: source ? [{ source_id: source.id, unit_cost: source.unit_cost, vendor_part_number: source.vendor_part_number }] : [],
      is_manual: true,
      all_sources: (sourcesByPart[selectedPart.id] || []).map(s => ({
        source_id: s.id,
        vendor_id: s.vendor_id,
        unit_cost: s.unit_cost,
        vendor_part_number: s.vendor_part_number,
      })),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-400" />
            Add Part to PO
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          {!selectedPart ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search parts..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-gray-800 border-gray-700 text-white"
                  autoFocus
                />
              </div>
              <div className="space-y-1 overflow-y-auto max-h-[50vh]">
                {filteredParts.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-6">No parts found</p>
                ) : (
                  filteredParts.map(part => {
                    const sources = sourcesByPart[part.id] || [];
                    const hasSource = sources.length > 0;
                    return (
                      <button
                        key={part.id}
                        onClick={() => handleSelectPart(part)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50 hover:border-gray-600 transition-colors text-left"
                      >
                        <Package className="w-4 h-4 text-gray-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{part.part_name}</p>
                          {part.vendor_part_number && (
                            <p className="text-xs text-gray-500">SKU: {part.vendor_part_number}</p>
                          )}
                        </div>
                        {hasSource ? (
                          <Badge className="bg-green-900/40 text-green-400 border-green-700 text-[9px] shrink-0">
                            {sources.length} source{sources.length > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-800 text-gray-500 border-gray-700 text-[9px] shrink-0">
                            No source
                          </Badge>
                        )}
                        <span className="text-xs font-mono text-gray-400 shrink-0">
                          {part.cost > 0 ? formatCurrencyUSD(part.cost) : '$0'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-white font-medium">{selectedPart.part_name}</p>
                {selectedPart.vendor_part_number && (
                  <p className="text-xs text-gray-500">SKU: {selectedPart.vendor_part_number}</p>
                )}
              </div>

              {/* Source selector */}
              {(sourcesByPart[selectedPart.id] || []).length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Vendor Source</label>
                  <div className="space-y-1">
                    {(sourcesByPart[selectedPart.id] || []).map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSource(s)}
                        className={cn(
                          "w-full flex items-center gap-2 p-2 rounded border text-left text-sm",
                          selectedSource?.id === s.id
                            ? "border-green-600 bg-green-900/20 text-white"
                            : "border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-600"
                        )}
                      >
                        <span className="flex-1">{s.vendor_part_number || 'Default'}</span>
                        <span className="font-mono text-xs">{formatCurrencyUSD(s.unit_cost || 0)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-1">Quantity</label>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
                  className="bg-gray-800 border-gray-700 text-white w-32"
                />
              </div>

              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span>Unit Cost: <span className="font-mono text-emerald-400">{formatCurrencyUSD(selectedSource?.unit_cost || selectedPart.cost || 0)}</span></span>
                <span>Extended: <span className="font-mono text-white">{formatCurrencyUSD((selectedSource?.unit_cost || selectedPart.cost || 0) * qty)}</span></span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedPart(null); setSelectedSource(null); }}
                className="text-gray-400 text-xs"
              >
                ← Pick different part
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-gray-800">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPart || qty < 1}
            className="bg-green-600 hover:bg-green-700 text-white gap-1"
          >
            <Plus className="w-4 h-4" />
            Add to PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}