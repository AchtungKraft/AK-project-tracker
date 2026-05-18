import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, Package, Truck, Wrench, User, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * ResolveNeedModal — Unified "Resolve Need Without PO" modal
 * 
 * Routes through executeSupplyAction with:
 * - RESOLVE_WITHOUT_PO (client supplied, shop supplied, already in stock, etc.)
 * - MARK_ORDERED_EXTERNALLY (ordered outside system)
 * - RECEIVE_WITHOUT_PO (receive into inventory without PO)
 * 
 * CANONICAL: All mutations go through executeSupplyAction. No direct entity writes.
 */

const RESOLUTION_MODES = [
  { value: 'resolve', label: 'Resolve Need', description: 'Part is available — satisfy shortage without a PO', icon: CheckCircle2, color: 'text-emerald-400' },
  { value: 'external_order', label: 'Already Ordered', description: 'Ordered outside the system — mark as on its way', icon: Truck, color: 'text-blue-400' },
  { value: 'receive', label: 'Receive Without PO', description: 'Physically receive into inventory without a PO', icon: Package, color: 'text-yellow-400' },
];

const RESOLUTION_TYPES = [
  { value: 'client_supplied', label: 'Client Supplied', description: 'Client provided this part' },
  { value: 'already_in_stock', label: 'Already In Stock', description: 'Found on shelf / already in inventory' },
  { value: 'shop_supplied', label: 'Shop Supplied', description: 'Using existing shop stock' },
  { value: 'local_purchase', label: 'Local Purchase', description: 'Bought locally / cash / credit card' },
  { value: 'externally_purchased', label: 'Externally Purchased', description: 'Ordered outside this system' },
  { value: 'vendor_warranty', label: 'Vendor Warranty', description: 'Warranty replacement from vendor' },
  { value: 'inventory_correction', label: 'Inventory Correction', description: 'Count correction / reconciliation' },
];

const RECEIVE_SOURCE_TYPES = [
  { value: 'client_shipped', label: 'Client Shipped' },
  { value: 'walk_in_purchase', label: 'Walk-in Purchase' },
  { value: 'emergency_sourcing', label: 'Emergency Sourcing' },
  { value: 'shelf_stock_found', label: 'Shelf Stock Found' },
  { value: 'manual_receive', label: 'Manual Receive' },
];

export default function ResolveNeedModal({ open, onClose, item, onSuccess }) {
  const [mode, setMode] = useState('resolve');
  const [resolutionType, setResolutionType] = useState('already_in_stock');
  const [receiveSourceType, setReceiveSourceType] = useState('manual_receive');
  const [qty, setQty] = useState(item?.to_order ?? 1);
  const [note, setNote] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [eta, setEta] = useState('');
  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!item) return null;

  const commitmentId = item.commitment_id || item.id;
  const partName = item.part_name || item.part?.part_name || 'Unknown';
  const projectName = item.project_name || 'Unknown Project';
  const gap = item.to_order ?? 0;

  const handleSubmit = async () => {
    if (qty <= 0) { toast.error('Quantity must be positive'); return; }
    setIsSubmitting(true);

    try {
      let actionType, payload;

      if (mode === 'resolve') {
        actionType = 'RESOLVE_WITHOUT_PO';
        payload = {
          action_type: actionType,
          commitment_ids: [commitmentId],
          payload: { resolution_type: resolutionType, qty_to_resolve: qty, note, allocate_inventory: true },
        };
      } else if (mode === 'external_order') {
        actionType = 'MARK_ORDERED_EXTERNALLY';
        payload = {
          action_type: actionType,
          commitment_ids: [commitmentId],
          payload: { vendor_name: vendorName, eta, external_order_number: externalOrderNumber, note },
        };
      } else {
        actionType = 'RECEIVE_WITHOUT_PO';
        payload = {
          action_type: actionType,
          payload: { part_id: item.part_id, qty, commitment_id: commitmentId, note, source_type: receiveSourceType },
        };
      }

      const response = await base44.functions.invoke('executeSupplyAction', payload);
      if (response.data?.success || response.data?.results) {
        toast.success(response.data?.message || 'Need resolved successfully');
        onSuccess?.();
        onClose();
      } else {
        toast.error(response.data?.error || 'Failed to resolve');
      }
    } catch (error) {
      toast.error(error.message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-yellow-400" />
            Resolve Procurement Need
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            <span className="text-white font-medium">{partName}</span> · {projectName}
            {gap > 0 && <Badge className="ml-2 bg-red-900/50 text-red-400 text-[10px]">{gap} needed</Badge>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Mode Selection */}
          <div className="grid grid-cols-3 gap-2">
            {RESOLUTION_MODES.map(m => {
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    mode === m.value
                      ? "border-red-600 bg-red-900/20"
                      : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                  )}
                >
                  <Icon className={cn("w-4 h-4 mb-1", m.color)} />
                  <p className="text-xs font-medium text-white">{m.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{m.description}</p>
                </button>
              );
            })}
          </div>

          {/* Mode-specific fields */}
          {mode === 'resolve' && (
            <div className="space-y-3">
              <div>
                <Label className="text-gray-400 text-xs">Resolution Type</Label>
                <Select value={resolutionType} onValueChange={setResolutionType}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <div>
                          <span>{t.label}</span>
                          <span className="text-gray-500 ml-2 text-xs">— {t.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Quantity to Resolve</Label>
                <Input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min={1} max={gap || 999}
                  className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
          )}

          {mode === 'external_order' && (
            <div className="space-y-3">
              <div>
                <Label className="text-gray-400 text-xs">Vendor / Supplier Name</Label>
                <Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="e.g. Pelican Parts"
                  className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">External Order #</Label>
                  <Input value={externalOrderNumber} onChange={e => setExternalOrderNumber(e.target.value)} placeholder="Optional"
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Expected ETA</Label>
                  <Input type="date" value={eta} onChange={e => setEta(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
              </div>
            </div>
          )}

          {mode === 'receive' && (
            <div className="space-y-3">
              <div>
                <Label className="text-gray-400 text-xs">Source Type</Label>
                <Select value={receiveSourceType} onValueChange={setReceiveSourceType}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECEIVE_SOURCE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Quantity to Receive</Label>
                <Input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min={1}
                  className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
          )}

          {/* Note — always available */}
          <div>
            <Label className="text-gray-400 text-xs">Note</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional details..."
              className="bg-gray-800 border-gray-700 text-white mt-1 h-16" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            {mode === 'resolve' ? 'Resolve Need' : mode === 'external_order' ? 'Mark Ordered' : 'Receive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}