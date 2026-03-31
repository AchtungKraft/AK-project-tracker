import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Clock, Truck, DollarSign, Package, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const TYPE_CONFIG = {
  vendor_cost: { label: "Vendor Cost", icon: Truck, color: "text-purple-400" },
  shipping: { label: "Shipping", icon: Package, color: "text-blue-400" },
  internal_labor: { label: "AK Labor", icon: Clock, color: "text-amber-400" },
  misc: { label: "Misc", icon: DollarSign, color: "text-gray-400" },
};

const TEMPLATES = [
  { type: "vendor_cost", description: "Vendor Service Cost", cost: 0, billing_rate: 0, quantity: 1 },
  { type: "shipping", description: "Shipping / Freight", cost: 0, billing_rate: 0, quantity: 1 },
  { type: "internal_labor", description: "Achtung Kraft Labor", cost: 75, billing_rate: 125, quantity: 1 },
  { type: "misc", description: "Miscellaneous Cost", cost: 0, billing_rate: 0, quantity: 1 },
];

export default function ServiceLineItemManager({ commitmentId, onTotalsChanged }) {
  const queryClient = useQueryClient();
  const [editModal, setEditModal] = useState(null); // null | "new" | lineItem object
  const [templateType, setTemplateType] = useState(null);

  const { data: lineItems = [], isLoading } = useQuery({
    queryKey: ["serviceLineItems", commitmentId],
    queryFn: () => base44.entities.ServiceLineItem.filter({ service_commitment_id: commitmentId }),
    enabled: !!commitmentId,
  });

  const { data: serviceVendors = [] } = useQuery({
    queryKey: ["serviceVendors"],
    queryFn: () => base44.entities.ServiceVendor.filter({ is_active: true }),
  });

  const vendorsMap = useMemo(() => new Map(serviceVendors.map(v => [v.id, v])), [serviceVendors]);

  const sorted = useMemo(() => [...lineItems].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [lineItems]);

  const totals = useMemo(() => {
    let cost = 0, billable = 0;
    for (const li of lineItems) {
      const qty = li.quantity || 1;
      cost += (li.cost || 0) * qty;
      billable += (li.billing_rate || 0) * qty;
    }
    const margin = billable > 0 ? ((billable - cost) / billable) * 100 : 0;
    return { cost, billable, margin };
  }, [lineItems]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["serviceLineItems", commitmentId] });
    onTotalsChanged?.();
  };

  const handleAddFromTemplate = (template) => {
    setTemplateType(template);
    setEditModal("new");
  };

  const handleDelete = async (lineItemId) => {
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "DELETE_LINE_ITEM",
        line_item_id: lineItemId,
      });
      toast.success("Line item deleted");
      invalidate();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-3">
      {/* Summary Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">Cost: <span className="text-white font-mono">{formatCurrencyUSD(totals.cost)}</span></span>
          <span className="text-gray-500">Billable: <span className="text-green-400 font-mono">{formatCurrencyUSD(totals.billable)}</span></span>
          <span className="text-gray-500">Margin: <span className={totals.margin >= 0 ? "text-green-400" : "text-red-400"}>{totals.margin.toFixed(1)}%</span></span>
        </div>
      </div>

      {/* Template Quick Add */}
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATES.map(t => {
          const cfg = TYPE_CONFIG[t.type];
          const Icon = cfg.icon;
          return (
            <Button
              key={t.type}
              variant="outline"
              size="sm"
              className="h-7 text-xs border-gray-700 text-gray-300 gap-1"
              onClick={() => handleAddFromTemplate(t)}
            >
              <Icon className={`w-3 h-3 ${cfg.color}`} />
              + {cfg.label}
            </Button>
          );
        })}
      </div>

      {/* Line Items List */}
      {sorted.length === 0 ? (
        <p className="text-xs text-gray-500 py-2">No line items yet. Add one above.</p>
      ) : (
        <div className="space-y-1">
          {sorted.map(li => {
            const cfg = TYPE_CONFIG[li.type] || TYPE_CONFIG.misc;
            const Icon = cfg.icon;
            const qty = li.quantity || 1;
            const lineCost = (li.cost || 0) * qty;
            const lineBillable = (li.billing_rate || 0) * qty;

            return (
              <div key={li.id} className="flex items-center gap-2 p-2 bg-gray-900/50 border border-gray-700/50 rounded group">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white truncate">{li.description}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-gray-700 text-gray-500">{cfg.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    {li.vendor_id && <span>{vendorsMap.get(li.vendor_id)?.name || "Vendor"}</span>}
                    {li.type === "internal_labor" && <span>{qty}h × {formatCurrencyUSD(li.cost || 0)}/hr</span>}
                    {li.type !== "internal_labor" && qty > 1 && <span>Qty: {qty}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono text-white">{formatCurrencyUSD(lineCost)}</p>
                  {lineBillable > 0 && lineBillable !== lineCost && (
                    <p className="text-[10px] font-mono text-green-400">{formatCurrencyUSD(lineBillable)}</p>
                  )}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditModal(li)}>
                    <Edit2 className="w-3 h-3 text-gray-400" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(li.id)}>
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit/Add Modal */}
      {editModal && (
        <LineItemEditModal
          lineItem={editModal === "new" ? null : editModal}
          template={editModal === "new" ? templateType : null}
          commitmentId={commitmentId}
          serviceVendors={serviceVendors}
          onClose={() => { setEditModal(null); setTemplateType(null); }}
          onSuccess={() => { invalidate(); setEditModal(null); setTemplateType(null); }}
        />
      )}
    </div>
  );
}

function LineItemEditModal({ lineItem, template, commitmentId, serviceVendors, onClose, onSuccess }) {
  const isNew = !lineItem;
  const defaults = template || lineItem || {};

  const [type, setType] = useState(defaults.type || "vendor_cost");
  const [description, setDescription] = useState(defaults.description || "");
  const [vendorId, setVendorId] = useState(defaults.vendor_id || "");
  const [cost, setCost] = useState(String(defaults.cost ?? ""));
  const [billingRate, setBillingRate] = useState(String(defaults.billing_rate ?? ""));
  const [quantity, setQuantity] = useState(String(defaults.quantity ?? "1"));
  const [notes, setNotes] = useState(defaults.notes || "");
  const [saving, setSaving] = useState(false);

  // Inline vendor creation
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [creatingVendor, setCreatingVendor] = useState(false);

  const isLabor = type === "internal_labor";

  const handleCreateVendor = async () => {
    if (!newVendorName.trim()) return;
    setCreatingVendor(true);
    try {
      const res = await base44.functions.invoke("executeServiceAction", {
        action_type: "CREATE_SERVICE_VENDOR",
        name: newVendorName.trim(),
      });
      setVendorId(res.data.vendor.id);
      toast.success("Vendor created");
      setShowNewVendor(false);
      setNewVendorName("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleSave = async () => {
    if (!description.trim()) { toast.error("Description required"); return; }
    setSaving(true);
    try {
      if (isNew) {
        await base44.functions.invoke("executeServiceAction", {
          action_type: "ADD_LINE_ITEM",
          service_commitment_id: commitmentId,
          type,
          description: description.trim(),
          vendor_id: vendorId || null,
          cost: parseFloat(cost) || 0,
          billing_rate: parseFloat(billingRate) || 0,
          quantity: parseFloat(quantity) || 1,
          notes: notes.trim() || null,
        });
      } else {
        await base44.functions.invoke("executeServiceAction", {
          action_type: "UPDATE_LINE_ITEM",
          line_item_id: lineItem.id,
          type,
          description: description.trim(),
          vendor_id: vendorId || null,
          cost: parseFloat(cost) || 0,
          billing_rate: parseFloat(billingRate) || 0,
          quantity: parseFloat(quantity) || 1,
          notes: notes.trim() || null,
        });
      }
      toast.success(isNew ? "Line item added" : "Line item updated");
      onSuccess();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const costNum = parseFloat(cost) || 0;
  const rateNum = parseFloat(billingRate) || 0;
  const qtyNum = parseFloat(quantity) || 1;
  const totalCost = costNum * qtyNum;
  const totalBillable = rateNum * qtyNum;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{isNew ? "Add Line Item" : "Edit Line Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-gray-300">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Description *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>

          {type !== "internal_labor" && (
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-gray-300">Service Vendor</Label>
                <Button variant="link" size="sm" className="text-xs text-blue-400 h-auto p-0" onClick={() => setShowNewVendor(!showNewVendor)}>
                  {showNewVendor ? "Cancel" : "+ New Vendor"}
                </Button>
              </div>
              {showNewVendor ? (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newVendorName}
                    onChange={e => setNewVendorName(e.target.value)}
                    placeholder="Vendor name..."
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                  <Button size="sm" onClick={handleCreateVendor} disabled={creatingVendor || !newVendorName.trim()}>
                    {creatingVendor ? "..." : "Add"}
                  </Button>
                </div>
              ) : (
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                    <SelectValue placeholder="Optional..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>None</SelectItem>
                    {serviceVendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-gray-300 text-xs">{isLabor ? "Hourly Rate" : "Cost"}</Label>
              <Input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">{isLabor ? "Bill Rate" : "Billing Rate"}</Label>
              <Input type="number" step="0.01" value={billingRate} onChange={e => setBillingRate(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">{isLabor ? "Hours" : "Qty"}</Label>
              <Input type="number" step="0.01" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
          </div>

          {/* Live Totals */}
          <div className="bg-gray-800/50 border border-gray-700 rounded p-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Total Cost</span>
              <p className="text-white font-mono">{formatCurrencyUSD(totalCost)}</p>
            </div>
            <div>
              <span className="text-gray-500">Total Billable</span>
              <p className="text-green-400 font-mono">{formatCurrencyUSD(totalBillable)}</p>
            </div>
            <div>
              <span className="text-gray-500">Margin</span>
              <p className={totalBillable > 0 && totalBillable >= totalCost ? "text-green-400" : "text-red-400"}>
                {totalBillable > 0 ? (((totalBillable - totalCost) / totalBillable) * 100).toFixed(1) : "0.0"}%
              </p>
            </div>
          </div>

          <div>
            <Label className="text-gray-300 text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional..." className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !description.trim()}>
            {saving ? "Saving..." : isNew ? "Add" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}