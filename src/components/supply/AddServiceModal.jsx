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
import GroupedVendorSelect from "@/components/supply/GroupedVendorSelect";
import CreateServiceVendorModal from "@/components/supply/CreateServiceVendorModal";
import useServiceVendorGroups from "@/components/supply/useServiceVendorGroups";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { toast } from "sonner";

const TYPE_CONFIG = {
  vendor_cost: { label: "Vendor Cost", icon: Truck, color: "text-purple-400" },
  shipping: { label: "Shipping", icon: Package, color: "text-blue-400" },
  internal_labor: { label: "AK Labor", icon: Clock, color: "text-amber-400" },
  misc: { label: "Misc", icon: DollarSign, color: "text-gray-400" },
};

// No string-guessing. Line item type comes from VendorGroup.default_line_item_type.

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

  // --- Vendor creation modal ---
  const [showVendorModal, setShowVendorModal] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.filter({ is_active: true }),
  });

  const { vendorGroups, vendorsByGroup, groupsMap } = useServiceVendorGroups();

  const selectedService = services.find(s => s.id === serviceId);
  const selectedGroupId = selectedService?.preferred_vendor_group_id || null;
  const selectedGroup = selectedGroupId ? groupsMap.get(selectedGroupId) : null;

  // Lock vendor dropdown to ONLY the service's group
  const lockedVendorGroups = selectedGroup ? [selectedGroup] : [];
  const lockedVendorsByGroup = selectedGroupId
    ? new Map([[selectedGroupId, vendorsByGroup.get(selectedGroupId) || []]])
    : new Map();

  const resolvedProjectId = isProjectLocked ? lockedProjectId : selectedProjectId;

  // Smart defaults when service changes — ALWAYS reset line items
  const handleServiceChange = (id) => {
    setServiceId(id);
    const svc = services.find(s => s.id === id);
    if (!svc) return;

    const groupId = svc.preferred_vendor_group_id;
    if (!groupId) {
      toast.error("Service must have a vendor group assigned in Admin");
      return;
    }

    // Auto-fill vendor: first vendor in group
    const groupVendors = vendorsByGroup.get(groupId) || [];
    setVendorId(groupVendors[0]?.id || "");

    // Line item type is admin-defined on the VendorGroup — no guessing
    const group = groupsMap.get(groupId);
    const defaultType = group?.default_line_item_type || "vendor_cost";
    const defaultDesc = defaultType === "shipping" ? "Shipping / Freight" : `${svc.name || "Service"} Cost`;
    setLineItems([{
      _key: Date.now(),
      type: defaultType,
      description: defaultDesc,
      vendor_id: groupVendors[0]?.id || "",
      cost: "",
      billing_rate: "",
      quantity: "1",
    }]);
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

  // --- Validation: at least one line item with cost or billing rate ---
  const canSave = resolvedProjectId && serviceId && description.trim() &&
    lineItems.length > 0 &&
    lineItems.some(li => (parseFloat(li.cost) || 0) > 0 || (parseFloat(li.billing_rate) || 0) > 0);

  // --- Save: atomic CREATE_WITH_LINE_ITEMS ---
  const handleSave = async () => {
    if (!canSave) {
      if (lineItems.length === 0) toast.error("Add at least one line item");
      else if (!lineItems.some(li => (parseFloat(li.cost) || 0) > 0 || (parseFloat(li.billing_rate) || 0) > 0)) toast.error("At least one line item needs a cost or billing rate");
      else toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("executeServiceAction", {
        action_type: "CREATE",
        project_id: resolvedProjectId,
        service_id: serviceId,
        description: description.trim(),
        vendor_id: (vendorId && vendorId !== "__none__") ? vendorId : null,
        quantity: 1,
        notes: notes.trim() || null,
        line_items: lineItems.map(li => {
          const cost = parseFloat(li.cost) || 0;
          const billing_rate = parseFloat(li.billing_rate) || cost;
          return {
            type: li.type,
            description: li.description.trim(),
            vendor_id: (li.vendor_id && li.vendor_id !== "__none__") ? li.vendor_id : null,
            cost,
            billing_rate,
            quantity: parseFloat(li.quantity) || 1,
          };
        }),
      });
      // PHASE 9: Show duplicate warning if detected
      if (res.data?.duplicate_warning) {
        toast.warning(res.data.duplicate_warning);
      }
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
          {/* Project (compact) */}
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
                {services.map(s => {
                  const g = groupsMap.get(s.preferred_vendor_group_id);
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {g ? `(${g.name})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedGroup && (
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-purple-600/50 text-purple-400">
                  Vendor Group: {selectedGroup.name}
                </Badge>
              </div>
            )}
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

          {/* Line Items Section - PRIMARY */}
          <div className="bg-gray-800/30 border border-green-800/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-400" />
              <Label className="text-gray-200 font-medium">Initial Cost Setup (Required)</Label>
            </div>
            <p className="text-[10px] text-gray-500 mb-3">Enter the cost for this service. A line item is auto-created when you select a service.</p>

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

            {/* Line items list — always show rows, never empty state */}
            <div className="space-y-2">
              {lineItems.length === 0 ? (
                <div className="text-xs text-gray-500 py-3 text-center border border-dashed border-gray-700 rounded">Select a service above to get started</div>
              ) : (
                lineItems.map(li => (
                  <InlineLineItemRow
                  key={li._key}
                  lineItem={li}
                  vendorGroups={lockedVendorGroups}
                  vendorsByGroup={lockedVendorsByGroup}
                  selectedGroupId={selectedGroupId}
                  onChange={(field, val) => updateLineItem(li._key, field, val)}
                  onRemove={() => lineItems.length > 1 && removeLineItem(li._key)}
                  canRemove={lineItems.length > 1}
                  />
                ))
              )}
            </div>

            {/* Totals preview */}
            {lineItems.length > 0 && (
              <div className="mt-2 bg-green-900/20 border border-green-800/40 rounded p-2 grid grid-cols-3 gap-2 text-xs">
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

          {/* ── Vendor (locked to group) ── */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-gray-300 text-xs">Primary Vendor</Label>
              {selectedGroupId && (
                <Button variant="link" size="sm" className="text-xs text-blue-400 h-auto p-0" onClick={() => setShowVendorModal(true)}>
                  + Add Vendor{selectedGroup ? ` to ${selectedGroup.name}` : ""}
                </Button>
              )}
            </div>
            <GroupedVendorSelect
              value={vendorId}
              onValueChange={setVendorId}
              vendorGroups={lockedVendorGroups}
              vendorsByGroup={lockedVendorsByGroup}
              selectedGroupId={selectedGroupId}
              placeholder="Select vendor..."
              showNone={true}
            />
            <CreateServiceVendorModal
              open={showVendorModal}
              onClose={() => setShowVendorModal(false)}
              onCreated={(vendor) => setVendorId(vendor.id)}
              serviceGroupId={selectedGroupId}
              serviceGroupName={selectedGroup?.name || ""}
            />
          </div>

          {/* ── Notes ── */}
          <div>
            <Label className="text-gray-300 text-xs">Notes</Label>
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
function InlineLineItemRow({ lineItem, vendorGroups, vendorsByGroup, selectedGroupId, onChange, onRemove, canRemove = true }) {
  // vendorGroups and vendorsByGroup are already locked to the service's group
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
        {canRemove && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
            <Trash2 className="w-3 h-3 text-red-400" />
          </Button>
        )}
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
      {!isLabor && (
        <GroupedVendorSelect
          value={lineItem.vendor_id || "__none__"}
          onValueChange={val => onChange("vendor_id", val === "__none__" ? "" : val)}
          vendorGroups={vendorGroups}
          vendorsByGroup={vendorsByGroup}
          selectedGroupId={selectedGroupId}
          placeholder="Vendor (optional)"
          className="bg-gray-900/50 border-gray-700 text-white h-7 text-xs"
        />
      )}
    </div>
  );
}