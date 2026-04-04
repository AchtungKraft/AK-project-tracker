import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart, Search, ArrowLeft, Building2, Package,
  RefreshCw, AlertTriangle, CheckCircle2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { useSupplyAction } from "@/components/supply/useProjectSupplyView";
import { VendorPOAvailableRow, VendorPOSelectedRow } from "./VendorPOLineRow";
import VendorPOConfirmModal from "./VendorPOConfirmModal";

/**
 * VendorPOBuilder — Step 2: Browse available parts for a vendor, build a PO cart, and submit.
 * Consumes getVendorSuggestions for available items.
 * Submits via createPurchaseOrdersFromCommitments with selected_sources.
 */
export default function VendorPOBuilder({ vendor, onBack, onSuccess }) {
  const [suggestions, setSuggestions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // { commitment_id, part_id, part_name, project_name, qty, max_qty, unit_cost, source_id }
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [etaDate, setEtaDate] = useState("");
  const [poNotes, setPONotes] = useState("");

  const supplyAction = useSupplyAction({
    showSuccessToast: true,
    onSuccess: () => {
      toast.success(`PO created for ${vendor.vendor_name}`);
      onSuccess?.();
    },
  });

  const fetchSuggestions = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('getVendorSuggestions', {
      vendor_id: vendor.id,
    });
    setSuggestions(res.data?.suggestions || []);
    setSummary(res.data?.summary || null);
    setLoading(false);
  };

  useEffect(() => { fetchSuggestions(); }, [vendor.id]);

  // Filter already-added items from available list
  const cartIds = useMemo(() => new Set(cart.map(c => c.commitment_id)), [cart]);

  const available = useMemo(() => {
    return suggestions
      .filter(s => !cartIds.has(s.commitment_id))
      .filter(s => {
        if (!search) return true;
        const q = search.toLowerCase();
        return s.part_name?.toLowerCase().includes(q) ||
          s.project_name?.toLowerCase().includes(q) ||
          s.vendor_part_number?.toLowerCase().includes(q);
      });
  }, [suggestions, cartIds, search]);

  // Cart totals
  const cartTotalQty = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotalCost = cart.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  const zeroCostLines = cart.filter(l => l.unit_cost <= 0);
  const totalSavingsAvailable = cart.reduce((s, l) => s + (l.price_delta_overall ?? l.price_delta ?? 0) * l.qty, 0);

  const handleAdd = (item) => {
    // Vendor compatibility guard: only allow parts that have a source for this vendor
    const hasVendorSource = item.has_dedicated_source || item.is_default_vendor;
    if (!hasVendorSource) {
      toast.error(`${item.part_name} has no source for ${vendor.vendor_name}`);
      return;
    }
    setCart(prev => [...prev, {
      commitment_id: item.commitment_id,
      part_id: item.part_id,
      part_name: item.part_name,
      project_name: item.project_name,
      qty: item.qty_to_order,
      max_qty: item.qty_to_order,
      unit_cost: item.unit_cost || 0,
      source_id: item.source_id || null,
      vendor_sources: item.has_dedicated_source
        ? [{ source_id: item.source_id, unit_cost: item.unit_cost, vendor_part_number: item.vendor_part_number }]
        : [],
      is_cheapest_source: item.is_cheapest_source,
      is_cheapest_overall: item.is_cheapest_overall,
      is_cheapest_for_vendor: item.is_cheapest_for_vendor,
      price_delta: item.price_delta,
      price_delta_overall: item.price_delta_overall,
      all_sources: item.all_sources || [],
    }]);
  };

  const handleAddAll = () => {
    // Only add items that are compatible with this vendor
    const compatible = available.filter(item => item.has_dedicated_source || item.is_default_vendor);
    if (compatible.length < available.length) {
      toast.info(`${available.length - compatible.length} item(s) skipped (no source for ${vendor.vendor_name})`);
    }
    const newLines = compatible.map(item => ({
      commitment_id: item.commitment_id,
      part_id: item.part_id,
      part_name: item.part_name,
      project_name: item.project_name,
      qty: item.qty_to_order,
      max_qty: item.qty_to_order,
      unit_cost: item.unit_cost || 0,
      source_id: item.source_id || null,
      vendor_sources: item.has_dedicated_source
        ? [{ source_id: item.source_id, unit_cost: item.unit_cost, vendor_part_number: item.vendor_part_number }]
        : [],
      is_cheapest_source: item.is_cheapest_source,
      is_cheapest_overall: item.is_cheapest_overall,
      is_cheapest_for_vendor: item.is_cheapest_for_vendor,
      price_delta: item.price_delta,
      price_delta_overall: item.price_delta_overall,
      all_sources: item.all_sources || [],
    }));
    setCart(prev => [...prev, ...newLines]);
  };

  const handleRemove = (idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx, updates) => {
    setCart(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l));
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);

    // Build selected_sources map
    const selected_sources = {};
    for (const line of cart) {
      if (line.source_id) {
        selected_sources[line.commitment_id] = line.source_id;
      }
    }

    const commitment_ids = cart.map(l => l.commitment_id);

    try {
      const res = await base44.functions.invoke('createPurchaseOrdersFromCommitments', {
        project_id: cart[0]?.project_id || suggestions[0]?.project_id,
        commitment_ids,
        override_vendor_id: vendor.id,
        selected_sources,
        eta_date: etaDate || null,
        notes: poNotes || `Vendor PO Builder: ${vendor.vendor_name}`,
        vendor_order_data: {
          [vendor.id]: {
            eta_date: etaDate || null,
            notes: poNotes || null,
          },
        },
      });

      const data = res.data;
      if (data?.ok) {
        toast.success(`Created ${data.created_orders?.length || 1} PO(s) with ${cart.length} line(s)`);
        onSuccess?.();
      } else {
        toast.error(data?.error || 'PO creation failed');
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Vendor Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-gray-400 hover:text-white gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: vendor.color || '#3B82F6' }}
        >
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">{vendor.vendor_name}</h2>
          <p className="text-xs text-gray-500">
            {summary?.total || 0} items available to order
          </p>
        </div>
      </div>

      {/* Cart Summary Bar */}
      {cart.length > 0 && (
        <Card className="bg-green-900/20 border-green-700/30">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-300">
                  {cart.length} item{cart.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              <span className="text-sm font-mono text-gray-300">{cartTotalQty} qty</span>
              <span className="text-sm font-mono text-emerald-400 font-bold">
                {formatCurrencyUSD(cartTotalCost)}
              </span>
              {zeroCostLines.length > 0 && (
                <Badge className="bg-amber-900/40 text-amber-400 border-amber-700 text-[9px]">
                  {zeroCostLines.length} $0 COST
                </Badge>
              )}
              {cart.filter(l => !(l.is_cheapest_overall ?? l.is_cheapest_source) && (l.price_delta_overall ?? l.price_delta) > 0).length > 0 && (
                <Badge className="bg-blue-900/40 text-blue-400 border-blue-700 text-[9px]">
                  {cart.filter(l => !(l.is_cheapest_overall ?? l.is_cheapest_source) && (l.price_delta_overall ?? l.price_delta) > 0).length} NOT CHEAPEST
                </Badge>
              )}
              {totalSavingsAvailable > 0 && (
                <span className="text-[10px] text-amber-400/70">
                  {formatCurrencyUSD(totalSavingsAvailable)} cheaper elsewhere
                </span>
              )}
            </div>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              Create PO
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Selected Items (Cart) */}
      {cart.length > 0 && (
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-green-400" />
                PO Lines
              </h3>
              {/* Column headers */}
              <div className="flex items-center gap-3 text-[9px] uppercase tracking-wider text-gray-500">
                <span className="w-20 text-center">Qty</span>
                <span className="w-20 text-right">Unit Cost</span>
                <span className="w-24 text-right">Extended</span>
                <span className="w-8" />
              </div>
            </div>
            {cart.map((line, idx) => (
              <VendorPOSelectedRow
                key={line.commitment_id}
                line={line}
                vendorSources={line.vendor_sources || []}
                onChange={updates => handleLineChange(idx, updates)}
                onRemove={() => handleRemove(idx)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* PO Details */}
      {cart.length > 0 && (
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">PO Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">ETA Date</label>
                <Input
                  type="date"
                  value={etaDate}
                  onChange={e => setEtaDate(e.target.value)}
                  className="bg-gray-900/50 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes</label>
                <Input
                  value={poNotes}
                  onChange={e => setPONotes(e.target.value)}
                  placeholder="Optional PO notes..."
                  className="bg-gray-900/50 border-gray-700 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Items */}
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-400" />
              Available to Order ({available.length})
            </h3>
            <div className="flex items-center gap-2">
              {available.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddAll}
                  className="border-gray-700 text-white gap-1 text-xs"
                >
                  <Plus className="w-3 h-3" />
                  Add All
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchSuggestions}
                className="text-gray-400"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Source comparison summary */}
          {!loading && available.length > 0 && (() => {
            const cheapestCount = available.filter(i => i.is_cheapest_source).length;
            const notCheapestCount = available.filter(i => !i.is_cheapest_source && i.price_delta > 0).length;
            const multiSourceCount = available.filter(i => (i.source_count || 0) > 1).length;
            if (multiSourceCount === 0) return null;
            return (
              <div className="flex items-center gap-3 text-[10px] text-gray-500 px-1">
                <span>{multiSourceCount} with multiple sources</span>
                {cheapestCount > 0 && <span className="text-green-400">{cheapestCount} best price</span>}
                {notCheapestCount > 0 && <span className="text-amber-400">{notCheapestCount} cheaper elsewhere</span>}
              </div>
            );
          })()}

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Filter parts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : available.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
              <p className="text-sm">
                {cart.length > 0 ? 'All available items added to PO' : 'No items need ordering from this vendor'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {available.map(item => (
                <VendorPOAvailableRow
                  key={item.commitment_id}
                  item={item}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Modal */}
      {showConfirm && (
        <VendorPOConfirmModal
          vendor={vendor}
          cart={cart}
          etaDate={etaDate}
          notes={poNotes}
          totalCost={cartTotalCost}
          totalQty={cartTotalQty}
          zeroCostCount={zeroCostLines.length}
          isSubmitting={submitting}
          onConfirm={handleSubmit}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}