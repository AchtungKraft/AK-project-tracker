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
import { Loader2, CheckCircle2, Package, Truck, Wrench, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * ResolveNeedModal — Unified "Resolve Need Without PO" modal
 *
 * Routes through executeSupplyAction with:
 * - RESOLVE_WITHOUT_PO (already have it — stock exists)
 * - RECEIVE_WITHOUT_PO (receive into inventory without PO)
 * - MARK_ORDERED_EXTERNALLY (ordered outside system — not here yet)
 */

const RESOLUTION_MODES = [
  { value: 'resolve', label: 'Already Have It', description: 'Part is in existing stock — just reserve it', icon: CheckCircle2, color: 'text-emerald-400' },
  { value: 'receive', label: 'Receive Now', description: 'Part is here physically — receive into inventory', icon: Package, color: 'text-yellow-400' },
  { value: 'external_order', label: 'Ordered Elsewhere', description: 'Ordered outside AK PO — not arrived yet', icon: Truck, color: 'text-blue-400' },
];

const RECEIVE_SOURCE_TYPES = [
  { value: 'CLIENT_SUPPLIED', label: 'Client Supplied', showCost: false },
  { value: 'EXTERNAL_PURCHASE', label: 'External Purchase', showCost: true },
  { value: 'CASH_PURCHASE', label: 'Cash Purchase', showCost: true },
  { value: 'VENDOR_SUPPLIED', label: 'Vendor Supplied (no PO)', showCost: true },
  { value: 'OTHER', label: 'Other', showCost: true },
];

const EXTERNAL_SOURCE_TYPES = [
  { value: 'CLIENT_SUPPLIED', label: 'Client Shipping' },
  { value: 'EXTERNAL_PURCHASE', label: 'External Purchase' },
  { value: 'VENDOR_SUPPLIED', label: 'Vendor Supplied' },
  { value: 'CASH_PURCHASE', label: 'Cash Purchase' },
  { value: 'OTHER', label: 'Other' },
];

function generateActionId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function ResolveNeedModal({ open, onClose, item, onSuccess }) {
  const [mode, setMode] = useState('resolve');
  const [qty, setQty] = useState(item?.to_order ?? 1);
  const [note, setNote] = useState('');
  // Receive Now fields
  const [receiveSource, setReceiveSource] = useState('EXTERNAL_PURCHASE');
  const [unitCost, setUnitCost] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [externalRef, setExternalRef] = useState('');
  // Ordered Elsewhere fields
  const [extSource, setExtSource] = useState('EXTERNAL_PURCHASE');
  const [extQty, setExtQty] = useState(item?.to_order ?? 1);
  const [extCost, setExtCost] = useState('');
  const [extVendor, setExtVendor] = useState('');
  const [extRef, setExtRef] = useState('');
  const [extEta, setExtEta] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionId] = useState(() => generateActionId());
  const { toast } = useToast();

  if (!item) return null;

  const commitmentId = item.commitment_id || item.id;
  const partName = item.part_name || item.part?.part_name || 'Unknown';
  const projectName = item.project_name || 'Unknown Project';
  const gap = item.to_order ?? 0;

  const showCost = RECEIVE_SOURCE_TYPES.find(s => s.value === receiveSource)?.showCost ?? true;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let invokePayload;

      if (mode === 'resolve') {
        if (qty <= 0) { toast({ title: 'Quantity must be positive', variant: 'destructive' }); return; }
        invokePayload = {
          action_type: 'RESOLVE_WITHOUT_PO',
          commitment_ids: [commitmentId],
          payload: { qty_to_resolve: qty, note, action_id: actionId },
        };
      } else if (mode === 'receive') {
        if (qty <= 0) { toast({ title: 'Quantity must be positive', variant: 'destructive' }); return; }
        invokePayload = {
          action_type: 'RECEIVE_WITHOUT_PO',
          payload: {
            commitment_id: commitmentId,
            part_id: item.part_id,
            qty,
            source_type: receiveSource,
            unit_cost: showCost ? (Number(unitCost) || 0) : 0,
            vendor_name: vendorName || null,
            external_reference: externalRef || null,
            note,
            action_id: actionId,
          },
        };
      } else {
        if (extQty <= 0) { toast({ title: 'Quantity must be positive', variant: 'destructive' }); return; }
        invokePayload = {
          action_type: 'MARK_ORDERED_EXTERNALLY',
          commitment_ids: [commitmentId],
          payload: {
            qty: extQty,
            source_type: extSource,
            unit_cost: Number(extCost) || 0,
            vendor_name: extVendor || null,
            external_reference: extRef || null,
            eta: extEta || null,
            note,
            action_id: actionId,
          },
        };
      }

      const response = await base44.functions.invoke('executeSupplyAction', invokePayload);
      const data = response.data || response;
      if (data.success) {
        toast({ title: data.message || 'Need resolved successfully' });
        onSuccess?.();
        onClose();
      } else {
        toast({ title: data.error || 'Failed to resolve', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: error.message || 'Action failed', variant: 'destructive' });
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
            Resolve Need
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

          {/* ── ALREADY HAVE IT ── */}
          {mode === 'resolve' && (
            <div className="space-y-3">
              <div>
                <Label className="text-gray-400 text-xs">Quantity to Reserve</Label>
                <Input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min={1} max={gap || 999}
                  className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <p className="text-[11px] text-gray-500">Reserves existing general stock for this commitment. No new inventory is created.</p>
            </div>
          )}

          {/* ── RECEIVE NOW ── */}
          {mode === 'receive' && (
            <div className="space-y-3">
              <div>
                <Label className="text-gray-400 text-xs">Source</Label>
                <Select value={receiveSource} onValueChange={setReceiveSource}>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Quantity</Label>
                  <Input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min={1}
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
                {showCost && (
                  <div>
                    <Label className="text-gray-400 text-xs">Unit Cost ($)</Label>
                    <Input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} min={0} step="0.01" placeholder="0.00"
                      className="bg-gray-800 border-gray-700 text-white mt-1" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Vendor / Source</Label>
                  <Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Optional"
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Reference #</Label>
                  <Input value={externalRef} onChange={e => setExternalRef(e.target.value)} placeholder="Optional"
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
              </div>
            </div>
          )}

          {/* ── ORDERED ELSEWHERE ── */}
          {mode === 'external_order' && (
            <div className="space-y-3">
              <div>
                <Label className="text-gray-400 text-xs">Source</Label>
                <Select value={extSource} onValueChange={setExtSource}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXTERNAL_SOURCE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Quantity</Label>
                  <Input type="number" value={extQty} onChange={e => setExtQty(Number(e.target.value))} min={1}
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Unit Cost ($)</Label>
                  <Input type="number" value={extCost} onChange={e => setExtCost(e.target.value)} min={0} step="0.01" placeholder="If known"
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Vendor / Supplier</Label>
                  <Input value={extVendor} onChange={e => setExtVendor(e.target.value)} placeholder="e.g. Pelican Parts"
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Reference #</Label>
                  <Input value={extRef} onChange={e => setExtRef(e.target.value)} placeholder="Order / tracking #"
                    className="bg-gray-800 border-gray-700 text-white mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Expected Arrival</Label>
                <Input type="date" value={extEta} onChange={e => setExtEta(e.target.value)}
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
            {mode === 'resolve' ? 'Reserve Stock' : mode === 'receive' ? 'Receive' : 'Mark Ordered'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}