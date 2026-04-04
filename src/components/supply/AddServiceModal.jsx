import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, FolderKanban, Trash2, Truck, Package, Clock, DollarSign } from "lucide-react";
import GroupedProjectSelector from "@/components/supply/GroupedProjectSelector";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { toast } from "sonner";

const TYPE_CONFIG = {
  vendor_cost: { label: "Vendor Cost", icon: Truck, color: "text-purple-400" },
  shipping: { label: "Shipping", icon: Package, color: "text-blue-400" },
  internal_labor: { label: "AK Labor", icon: Clock, color: "text-amber-400" },
  misc: { label: "Misc", icon: DollarSign, color: "text-gray-400" },
};

// Map service category → default first line item type
const CATEGORY_TO_LINE_TYPE = {
  shipping: "shipping",
  finishing: "vendor_cost",
  coating: "vendor_cost",
  plating: "vendor_cost",
  fabrication: "vendor_cost",
  upholstery: "vendor_cost",
  electrical: "vendor_cost",
  paint: "vendor_cost",
  machine_work: "vendor_cost",
  inspection: "vendor_cost",
  other: "vendor_cost",
};

/**
 * AddServiceModal — Line-Item-Driven Create Flow
 *
 * Creates a ServiceCommitment + at least one ServiceLineItem atomically.
 * No legacy estimated_cost / actual_cost fields are written.
 *
 * Props:
 *  - projectId: string | null — when provided, project is locked
 *  - projectName: string | null
 *  - open: boolean
 *  - onClose: () => void
 *  - onSuccess: () => void
 */
export default function AddServiceModal({ projectId: rawProjectId, projectName: lockedProjectName, open, onClose, onSuccess }) {
  const lockedProjectId = (rawProjectId != null && rawProjectId !== "") ? String(rawProjectId) : null;
  const isProjectLocked = lockedProjectId !== null;

  // --- Commitment fields ---
  const [selectedProjectId, setSelectedProjectId] = useState(lockedProjectId || "");
  const [projectSearch, setProjectSearch] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // --- Inline line items (created before save) ---
  const [lineItems, setLineItems] = useState([]);

  // --- Inline vendor creation ---
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [creatingVendor, setCreatingVendor] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.filter({ is_active: true }),
  });

  const { data: serviceVendors = [] } = useQuery({
    queryKey: ["serviceVendors"],
    queryFn: () => base44.entities.ServiceVendor.filter({ is_active: true }),
  });

  const selectedService = services.find(s => s.id === serviceId);

  // Vendor filtering: allowed vendors if set, otherwise all
  const filteredVendors = useMemo(() => {
    if (!selectedService?.allowed_vendor_ids?.length) return serviceVendors;
    return serviceVendors.filter(v => selectedService.allowed_vendor_ids.includes(v.id));
  }, [selectedService, serviceVendors]);

  const resolvedProjectId = isProjectLocked ? lockedProjectId : selectedProjectId;

  // Smart defaults when service changes
  const handleServiceChange = (id) => {
    setServiceId(id);
    const svc = services.find(s => s.id === id);
    // Auto-fill vendor
    if (svc?.default_vendor_id) {
      setVendorId(svc.default_vendor_id);
    } else {
      setVendorId("");
    }
    // If no line items yet, auto-add a default one based on category
    if (lineItems.length === 0 && svc) {
      const defaultType = CATEGORY_TO_LINE_TYPE[svc.category] || "vendor_cost";
      const defaultDesc = defaultType === "shipping" ? "Shipping / Freight" : `${svc.name || "Service"} Cost`;
      setLineItems([{
        _key: Date.now(),
        type: defaultType,
        description: defaultDesc,
        vendor_id: svc.default_vendor_id || "",
        cost: "",
        billing_rate: "",
        quantity: "1",
      }]);
    }
  };

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

  // --- Line item CRUD (local state only, persisted on save) ---
  const addLineItem = (type) => {
    const cfg = TYPE_CONFIG[type];
    const defaultDesc = type === "shipping" ? "Shipping / Freight"
      : type === "internal_labor" ? "Achtung Kraft Labor"
      : type === "misc" ? "Miscellaneous Cost"
      : `${selectedService?.name || "Service"} Cost`;
    const defaultCost = type === "internal_labor" ? "75" : "";
    const defaultRate = type === "internal_labor" ? "125" : "";
    setLineItems(prev => [...prev, {
      _key: Date.now() + Math.random(),
      type,
      description: defaultDesc,
      vendor_id: vendorId || "",
      cost: defaultCost,
      billing_rate: defaultRate,
      quantity: "1",
    }]);
  };

  const updateLineItem = (key, field, value) => {
    setLineItems(prev => prev.map(li => li._key === key ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (key) => {
    setLineItems(prev => prev.filter(li => li._key !== key));
  };

  // --- Computed totals ---
  const totals = useMemo(() => {
    let cost = 0, billable = 0;
    for (const li of lineItems) {
      const qty = parseFloat(li.quantity) || 1;
      cost += (parseFloat(li.cost) || 0) * qty;
      billable += (parseFloat(li.billing_rate) || 0) * qty;
    }
    const margin = billable > 0 ? ((billable - cost) / billable) * 100 : 0;
    return { cost, billable, margin };
  }, [lineItems]);

  // --- Validation ---
  const hasValidLineItems = lineItems.length > 0 && lineItems.every(li =>
    li.description?.trim() && ((parseFloat(li.cost) || 0) > 0 || (parseFloat(li.billing_rate) || 0) > 0)
  );
  const canSave = resolvedProjectId && serviceId && description.trim() && hasValidLineItems;

  // --- Save: atomic CREATE_WITH_LINE_ITEMS ---
  const handleSave = async () => {
    if (!canSave) {
      if (lineItems.length === 0) toast.error("Add at least one line item");
      else if (!hasValidLineItems) toast.error("Each line item needs a cost or billing rate");
      else toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "CREATE",
        project_id: resolvedProjectId,
        service_id: serviceId,
        description: description.trim(),
        vendor_id: (vendorId && vendorId !== "__none__") ? vendorId : (selectedService?.default_vendor_id || null),
        quantity: 1,
        notes: notes.trim() || null,
        line_items: lineItems.map(li => ({
          type: li.type,
          description: li.description.trim(),
          vendor_id: (li.vendor_id && li.vendor_id !== "__none__") ? li.vendor_id : null,
          cost: parseFloat(li.cost) || 0,
          billing_rate: parseFloat(li.billing_rate) || 0,
          quantity: parseFloat(li.quantity) || 1,
        })),
      });
      toast.success("Service added with line items");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Create Service Commitment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          {/* ── Project ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <Label className="text-gray-300 font-medium">Project *</Label>
            </div>
            {isProjectLocked ? (
              <div className="bg-gray-800/70 border border-gray-700 rounded-md px-3 py-2 flex items-center gap-2">
                <Badge variant="outline" className="border-blue-600/50 text-blue-400 text-xs">Locked</Badge>
                <span className="text-white text-sm">{lockedProjectName || "Project"}</span>
              </div>
            ) : (
              <GroupedProjectSelector
                selectedProjectId={selectedProjectId}
                onSelect={setSelectedProjectId}
                searchTerm={projectSearch}
                onSearchChange={setProjectSearch}
              />
            )}
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ── Service Selection ── */}
          <div>
            <Label className="text-gray-300">Service *</Label>
            <Select value={serviceId} onValueChange={handleServiceChange}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select a service..." />
              </SelectTrigger>
              <SelectContent>
                {services.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.category ? `(${s.category})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300">Description *</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Shipment #2, Chrome plating batch"
              className="bg-gray-800 border-gray-600 text-white mt-1"
            />
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ── Vendor ── */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">Primary Vendor</Label>
              <Button variant="link" size="sm" className="text-xs text-blue-400 h-auto p-0" onClick={() => setShowNewVendor(!showNewVendor)}>
                {showNewVendor ? "Cancel" : "+ New Vendor"}
              </Button>
            </div>
            {showNewVendor ? (
              <div className="flex gap-2 mt-1">
                <Input value={newVendorName} onChange={e => setNewVendorName(e.target.value)} placeholder="Vendor name..." className="bg-gray-800 border-gray-600 text-white" />
                <Button size="sm" onClick={handleCreateVendor} disabled={creatingVendor || !newVendorName.trim()}>
                  {creatingVendor ? "..." : "Add"}
                </Button>
              </div>
            ) : (
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                  <SelectValue placeholder="Select vendor (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {filteredVendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ── Line Items Section ── */}
          <div>
            <Label className="text-gray-300 font-medium">Cost Breakdown *</Label>
            <p className="text-[10px] text-gray-500 mb-2">Add at least one line item. Each needs a cost or billing rate.</p>

            {/* Quick-add buttons */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-gray-700 text-gray-300 gap-1"
                    onClick={() => addLineItem(type)}
                  >
                    <Icon className={`w-3 h-3 ${cfg.color}`} />
                    + {cfg.label}
                  </Button>
                );
              })}
            </div>

            {/* Line items list */}
            {lineItems.length === 0 ? (
              <p className="text-xs text-amber-400 py-2">⚠ No line items — select a service above or add one manually.</p>
            ) : (
              <div className="space-y-2">
                {lineItems.map(li => (
                  <InlineLineItemRow
                    key={li._key}
                    lineItem={li}
                    serviceVendors={filteredVendors}
                    onChange={(field, val) => updateLineItem(li._key, field, val)}
                    onRemove={() => removeLineItem(li._key)}
                  />
                ))}
              </div>
            )}

            {/* Totals preview */}
            {lineItems.length > 0 && (
              <div className="mt-2 bg-gray-800/50 border border-gray-700 rounded p-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Total Cost</span>
                  <p className="text-white font-mono">{formatCurrencyUSD(totals.cost)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Total Billable</span>
                  <p className="text-green-400 font-mono">{formatCurrencyUSD(totals.billable)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Margin</span>
                  <p className={totals.margin >= 0 ? "text-green-400" : "text-red-400"}>{totals.margin.toFixed(1)}%</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ── Notes ── */}
          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." className="bg-gray-800 border-gray-600 text-white mt-1" rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact inline row for a single line item during creation */
function InlineLineItemRow({ lineItem, serviceVendors, onChange, onRemove }) {
  const cfg = TYPE_CONFIG[lineItem.type] || TYPE_CONFIG.misc;
  const Icon = cfg.icon;
  const isLabor = lineItem.type === "internal_labor";

  return (
    <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-2.5 space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-gray-700 text-gray-400">{cfg.label}</Badge>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <Trash2 className="w-3 h-3 text-red-400" />
        </Button>
      </div>

      {/* Description */}
      <Input
        value={lineItem.description}
        onChange={e => onChange("description", e.target.value)}
        placeholder="Line item description..."
        className="bg-gray-900/50 border-gray-700 text-white h-7 text-xs"
      />

      {/* Cost / Billing Rate / Qty row */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-gray-500 text-[10px]">{isLabor ? "Hourly Rate" : "Cost"}</Label>
          <Input
            type="number"
            step="0.01"
            value={lineItem.cost}
            onChange={e => onChange("cost", e.target.value)}
            placeholder="0.00"
            className="bg-gray-900/50 border-gray-700 text-white h-7 text-xs mt-0.5"
          />
        </div>
        <div>
          <Label className="text-gray-500 text-[10px]">{isLabor ? "Bill Rate" : "Billing Rate"}</Label>
          <Input
            type="number"
            step="0.01"
            value={lineItem.billing_rate}
            onChange={e => onChange("billing_rate", e.target.value)}
            placeholder="0.00"
            className="bg-gray-900/50 border-gray-700 text-white h-7 text-xs mt-0.5"
          />
        </div>
        <div>
          <Label className="text-gray-500 text-[10px]">{isLabor ? "Hours" : "Qty"}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={lineItem.quantity}
            onChange={e => onChange("quantity", e.target.value)}
            placeholder="1"
            className="bg-gray-900/50 border-gray-700 text-white h-7 text-xs mt-0.5"
          />
        </div>
      </div>

      {/* Vendor for non-labor */}
      {!isLabor && serviceVendors.length > 0 && (
        <Select value={lineItem.vendor_id || "__none__"} onValueChange={val => onChange("vendor_id", val === "__none__" ? "" : val)}>
          <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white h-7 text-xs">
            <SelectValue placeholder="Vendor (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No vendor</SelectItem>
            {serviceVendors.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}