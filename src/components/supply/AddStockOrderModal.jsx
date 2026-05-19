import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Warehouse, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { forceAppRefresh, extractRefreshContext } from "@/components/supply/forceAppRefresh";

/**
 * AddStockOrderModal — Creates a STOCK_MANUAL PartCommitment on AK_STOCK project.
 * Used from GlobalNeedToOrder for buyer-initiated stock purchases.
 */
export default function AddStockOrderModal({ open, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [selectedPartId, setSelectedPartId] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('buyer_override');
  const [notes, setNotes] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: parts = [] } = useQuery({
    queryKey: ['parts_stock_modal'],
    queryFn: () => base44.entities.Part.list('-updated_date', 500),
    staleTime: 60000,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_stock_modal'],
    queryFn: () => base44.entities.Vendor.list(),
    staleTime: 60000,
  });

  const filteredParts = useMemo(() => {
    const active = parts.filter(p => !p.is_archived);
    if (!partSearch) return active.slice(0, 50);
    const s = partSearch.toLowerCase();
    return active.filter(p =>
      p.part_name?.toLowerCase().includes(s) ||
      p.vendor_part_number?.toLowerCase().includes(s)
    ).slice(0, 50);
  }, [parts, partSearch]);

  const selectedPart = parts.find(p => p.id === selectedPartId);
  const vendorName = selectedPart?.default_vendor_id
    ? vendors.find(v => v.id === selectedPart.default_vendor_id)?.vendor_name
    : null;

  const handleSubmit = async () => {
    if (!selectedPartId || qty <= 0) {
      toast.error('Select a part and quantity');
      return;
    }

    setSubmitting(true);
    try {
      // Get or create AK_STOCK project
      const projects = await base44.entities.Project.filter({
        is_system_project: true,
        system_project_type: 'AK_STOCK',
      });
      let stockProject = projects[0];
      if (!stockProject) {
        stockProject = await base44.entities.Project.create({
          name: 'AK STOCK',
          is_system_project: true,
          system_project_type: 'AK_STOCK',
          financial_model_version: 'forward',
        });
      }

      // Create commitment via executeSupplyAction
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADJUST_REQUIRED',
        payload: {
          project_id: stockProject.id,
          part_id: selectedPartId,
          required_total_set: qty,
          source_type: 'STOCK',
          // Metadata applied atomically during create/update
          demand_source: 'STOCK_MANUAL',
          stock_reason: reason,
          notes: notes || `Manual stock order: ${reason}`,
        },
      });

      const result = response.data;
      if (result?.error) throw new Error(result.error);

      const qtyResult = result?.required_total ?? qty;
      toast.success(`Added ${qtyResult} to AK Stock order needs for ${selectedPart?.part_name}`);
      
      // Deterministic cache invalidation via canonical refresh path
      const context = extractRefreshContext(result, { part_id: selectedPartId, project_id: stockProject.id });
      await forceAppRefresh(queryClient, context);
      // Also invalidate stock-specific queries not covered by forceAppRefresh
      queryClient.invalidateQueries({ queryKey: ['stockCommitments'] });
      queryClient.invalidateQueries({ queryKey: ['akStockProject'] });
      
      onSuccess?.();
      handleClose();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPartId('');
    setQty(1);
    setReason('buyer_override');
    setNotes('');
    setPartSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Warehouse className="w-5 h-5 text-blue-400" />
            Add Stock Order
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Part search */}
          <div>
            <Label className="text-gray-400 text-xs">Part</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts..."
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                className="pl-9 bg-gray-800 border-gray-700 text-white"
              />
            </div>
            {partSearch && !selectedPartId && (
              <div className="mt-1 max-h-40 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg">
                {filteredParts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPartId(p.id); setPartSearch(p.part_name); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-gray-200"
                  >
                    <div className="font-medium">{p.part_name}</div>
                    {p.vendor_part_number && <div className="text-xs text-gray-500">{p.vendor_part_number}</div>}
                  </button>
                ))}
              </div>
            )}
            {selectedPart && (
              <div className="mt-1.5 p-2 bg-gray-800/60 rounded text-sm">
                <span className="text-white font-medium">{selectedPart.part_name}</span>
                {vendorName && <span className="text-gray-500 ml-2">· {vendorName}</span>}
                {selectedPart.physical_stock != null && (
                  <span className="text-gray-500 ml-2">· Stock: {selectedPart.physical_stock}</span>
                )}
                <button
                  onClick={() => { setSelectedPartId(''); setPartSearch(''); }}
                  className="text-red-400 text-xs ml-2 hover:underline"
                >clear</button>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-gray-400 text-xs">Quantity</Label>
            <Input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="mt-1 bg-gray-800 border-gray-700 text-white w-28"
            />
          </div>

          {/* Reason */}
          <div>
            <Label className="text-gray-400 text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer_override">Buyer Override</SelectItem>
                <SelectItem value="seasonal">Seasonal Stock</SelectItem>
                <SelectItem value="safety_stock">Safety Stock</SelectItem>
                <SelectItem value="bulk_vendor_order">Bulk Vendor Order</SelectItem>
                <SelectItem value="forecasted_usage">Forecasted Usage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-400 text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why are you ordering this stock?"
              className="mt-1 bg-gray-800 border-gray-700 text-white h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="border-gray-700 text-gray-300">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedPartId || qty <= 0 || submitting}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />}
            Create Stock Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}