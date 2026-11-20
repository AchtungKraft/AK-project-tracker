import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Package, AlertTriangle, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import BillableLaborGroup from "./BillableLaborGroup";
import BillablePartsGroup from "./BillablePartsGroup";
import BillableServicesGroup from "./BillableServicesGroup";
import BillableSection from "./BillableSection";
import BillableEligibilityPanel from "./BillableEligibilityPanel";

/**
 * BillableItemsSelector — Create Invoice builder, in five sections:
 * Current/Earned Labor · Projected/Unearned Labor · Current Billable Parts · Projected/Unpurchased Parts · Services.
 * Groups are collapsed by default. Projected items are never auto- or bulk-selected. Partial qty/hours allowed;
 * the server rejects anything above what is available (never capped silently).
 */

function useProjectBillableItems(projectId) {
  return useQuery({
    queryKey: ["billableItems", projectId],
    queryFn: async () => (projectId ? (await base44.functions.invoke("resolveProjectBillableItems", { project_id: projectId })).data : null),
    enabled: !!projectId,
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });
}

// Current and projected rows can share a source id, so selection is keyed by selection_key when present.
const keyOf = (i) => i.selection_key || i.source_id;
const isProjected = (i) => i.metadata?.labor_basis === "projected" || i.labor_basis === "projected" || i.metadata?.part_basis === "projected" || i.part_basis === "projected";
const sumTotal = (items) => items.reduce((s, i) => s + (i.line_total || 0), 0);

function byVendor(parts) {
  const groups = {};
  for (const item of parts) {
    const key = item.vendor_name || "Unknown Vendor";
    if (!groups[key]) groups[key] = { vendor_name: key, vendor_id: item.vendor_id, total: 0, items: [] };
    groups[key].items.push(item);
    groups[key].total += item.line_total;
  }
  return Object.values(groups).sort((a, b) => (a.vendor_name === "Unknown Vendor" ? 1 : b.vendor_name === "Unknown Vendor" ? -1 : a.vendor_name.localeCompare(b.vendor_name)));
}

export default function BillableItemsSelector({ projectId, selectedItems, onSelectionChange, className, autoSelect = true, preselectSourceIds = null }) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedServices, setExpandedServices] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const { data, isLoading, error } = useProjectBillableItems(projectId);

  const { allItems, defaultItems } = useMemo(() => {
    const items = (data?.items || []).filter((i) => i.line_total > 0 && i.qty_available_to_bill > 0);
    return { allItems: items, defaultItems: items.filter((i) => !isProjected(i)) };
  }, [data]);

  const sections = useMemo(() => {
    const s = searchTerm.toLowerCase();
    const items = s ? allItems.filter((i) => i.description?.toLowerCase().includes(s)) : allItems;
    const parts = items.filter((i) => i.type === "part");
    const currentParts = parts.filter((i) => !isProjected(i));
    const projectedParts = parts.filter(isProjected);
    return {
      labor: items.filter((i) => i.type === "labor" && !isProjected(i)),
      projectedLabor: items.filter((i) => i.type === "labor" && isProjected(i)),
      currentParts, projectedParts, currentGroups: byVendor(currentParts), projectedGroups: byVendor(projectedParts),
      services: items.filter((i) => i.type === "service"),
    };
  }, [allItems, searchTerm]);

  const selectedSet = useMemo(() => new Set(selectedItems.map(keyOf)), [selectedItems]);
  const selectedByKey = useMemo(() => new Map(selectedItems.map((s) => [keyOf(s), s])), [selectedItems]);

  const buildPayload = useCallback((item) => ({
    selection_key: item.selection_key || null,
    labor_basis: item.type === "labor" ? (isProjected(item) ? "projected" : "earned") : undefined,
    part_basis: item.type === "part" ? (item.metadata?.part_basis || null) : undefined,
    source_entity: item.source_entity, source_id: item.source_id, type: item.type,
    part_id: item.part_id, service_id: item.service_id || null, description: item.description,
    part_name: item.part_name || item.description, vendor_id: item.vendor_id, vendor_name: item.vendor_name,
    category_id: item.category_id, category_name: item.category_name,
    qty: item.qty_available_to_bill, unit_price: item.unit_price, unit_cost: item.unit_cost || 0,
    line_total: item.line_total, cost_total: item.cost_total, net_exposure: item.line_total, gross_exposure: item.line_total,
    credit_applied: 0, needs_review: item.needs_review, review_reason: item.review_reason, children: item.children || null,
  }), []);

  // Auto-select current/earned items only, small datasets (<50), once per project.
  // When a caller hands in specific source ids (e.g. the parts workbench), select exactly those billable rows instead.
  useEffect(() => {
    if (preselectSourceIds?.length && allItems.length > 0 && selectedItems.length === 0 && !hasAutoSelected) {
      const ids = new Set(preselectSourceIds);
      const seen = new Set();
      onSelectionChange(allItems.filter((i) => ids.has(i.source_id) && !seen.has(i.source_id) && seen.add(i.source_id)).map(buildPayload));
      setHasAutoSelected(true);
      return;
    }
    if (defaultItems.length > 0 && selectedItems.length === 0 && !hasAutoSelected) {
      if (autoSelect && !preselectSourceIds?.length && defaultItems.length < 50) {
        const seen = new Set();
        onSelectionChange(defaultItems.filter((i) => !seen.has(keyOf(i)) && seen.add(keyOf(i))).map(buildPayload));
      }
      setHasAutoSelected(true);
    }
  }, [allItems, defaultItems, autoSelect, preselectSourceIds, hasAutoSelected, selectedItems.length, buildPayload, onSelectionChange]);

  useEffect(() => { setHasAutoSelected(false); setExpandedGroups({}); setExpandedServices({}); }, [projectId]);

  const toggleGroup = useCallback((key) => setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] })), []);
  const toggleServiceExpand = useCallback((id) => setExpandedServices((prev) => ({ ...prev, [id]: !prev[id] })), []);

  const sel = useMemo(() => {
    const isSelected = (item) => selectedSet.has(keyOf(item));
    const selectGroup = (items) => onSelectionChange([...selectedItems, ...items.filter((i) => !selectedSet.has(keyOf(i))).map(buildPayload)]);
    const deselectGroup = (items) => { const ids = new Set(items.map(keyOf)); onSelectionChange(selectedItems.filter((s) => !ids.has(keyOf(s)))); };
    return {
      keyOf, isSelected, selectGroup, deselectGroup,
      toggle: (item, checked) => (checked ? onSelectionChange([...selectedItems, buildPayload(item)]) : onSelectionChange(selectedItems.filter((s) => keyOf(s) !== keyOf(item)))),
      // Partial allocation of hours or qty. Over-entry is shown as an error, never capped.
      qtyChange: (item, q) => onSelectionChange(selectedItems.map((s) => (keyOf(s) === keyOf(item)
        ? { ...s, qty: q, line_total: Math.round((q || 0) * s.unit_price * 100) / 100, cost_total: Math.round((q || 0) * (item.unit_cost || 0) * 100) / 100, net_exposure: (q || 0) * s.unit_price, gross_exposure: (q || 0) * s.unit_price }
        : s))),
      // Admin part price override (null restores the canonical price). Validated again on the server.
      priceChange: (item, o) => onSelectionChange(selectedItems.map((s) => {
        if (keyOf(s) !== keyOf(item)) return s;
        const price = o ? o.unit_price : item.unit_price;
        const total = Math.round((s.qty || 0) * price * 100) / 100;
        return { ...s, unit_price: price, price_override: o ? { reason: o.reason, below_cost_approved: o.below_cost_approved } : null, line_total: total, net_exposure: total, gross_exposure: total };
      })),
      selectedOverride: (item) => { const s = selectedByKey.get(keyOf(item)); return s?.price_override ? { ...s.price_override, unit_price: s.unit_price } : null; },
      selectedQty: (item) => selectedByKey.get(keyOf(item))?.qty,
      isGroupFullySelected: (items) => items.length > 0 && items.every(isSelected),
      isGroupPartiallySelected: (items) => { const n = items.filter(isSelected).length; return n > 0 && n < items.length; },
    };
  }, [selectedItems, selectedSet, selectedByKey, onSelectionChange, buildPayload]);

  if (!projectId) return <div className="flex items-center justify-center h-40 text-gray-500">Select a project</div>;
  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>;
  if (error) return <div className="flex items-center justify-center h-40 text-red-400"><AlertTriangle className="w-5 h-5 mr-2" />Failed to load</div>;
  if (allItems.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center justify-center h-32 text-gray-500"><Package className="w-8 h-8 mb-2 text-gray-600" />
          <p>{data?.billing_designation === "NON_BILLABLE" ? "This project is marked Non-Billable, so nothing can be invoiced" : "No items available for a new invoice"}</p></div>
        <BillableEligibilityPanel summary={data?.summary} allocated={data?.allocated_items} excluded={data?.excluded_items} />
      </div>
    );
  }

  const allSelected = defaultItems.length > 0 && defaultItems.every(sel.isSelected);
  const laborGroupProps = (items, key) => ({
    items, expanded: !!expandedGroups[key], onToggleExpand: () => toggleGroup(key),
    isSelected: sel.isSelected, selectedQty: sel.selectedQty, onQtyChange: sel.qtyChange, onToggle: sel.toggle,
    allSelected: sel.isGroupFullySelected(items), someSelected: sel.isGroupPartiallySelected(items),
    onSelectAll: () => sel.selectGroup(items), onDeselectAll: () => sel.deselectGroup(items),
  });
  const { labor, projectedLabor, currentParts, projectedParts, currentGroups, projectedGroups, services } = sections;
  const b = data?.budget;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-800/50 rounded-lg text-sm">
        <span className="text-gray-400 text-xs sm:text-sm">Received parts, services and earned labor {formatCurrencyUSD(sumTotal(defaultItems))} · unreceived parts and projected labor are optional</span>
        <Button variant="ghost" size="sm" onClick={allSelected ? () => onSelectionChange([]) : () => sel.selectGroup(defaultItems)} className="h-6 px-2 text-xs gap-1 shrink-0">
          <CheckSquare className="w-3 h-3" />{allSelected ? "Deselect All" : "Select received & earned"}
        </Button>
      </div>

      {b && (
        <p className="px-3 text-xs text-gray-500">
          {b.agreed_budget != null
            ? <>Authorized {formatCurrencyUSD(b.agreed_budget)} · {formatCurrencyUSD(b.billed_and_drafted)} invoiced or on drafts (net of credits) · <span className={b.remaining < 0 ? "text-red-400" : "text-gray-300"}>{formatCurrencyUSD(b.remaining)} remaining</span></>
            : "No confirmed client-agreed billing budget. Projected labor can't be billed until one is confirmed."}
        </p>
      )}

      <Input placeholder="Search items..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-gray-800 border-gray-700" />

      <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
        <BillableSection title="Earned Labor" count={labor.length} total={sumTotal(labor)} hint="Logged billable hours.">
          <BillableLaborGroup {...laborGroupProps(labor, "__labor__")} />
        </BillableSection>
        <BillableSection title="Projected Labor (advance billing)" count={projectedLabor.length} total={sumTotal(projectedLabor)} hint="Advance billing against task estimates. Applied first against hours logged later.">
          <BillableLaborGroup projected {...laborGroupProps(projectedLabor, "__projected__")} />
        </BillableSection>
        <BillableSection title="Received Parts" count={currentParts.length} total={sumTotal(currentParts)} hint="In stock or installed.">
          <div className="space-y-2"><BillablePartsGroup groups={currentGroups} expandedGroups={expandedGroups} toggleGroup={toggleGroup} keyPrefix="current" sel={sel} /></div>
        </BillableSection>
        <BillableSection title="Unreceived Parts (advance billing)" count={projectedParts.length} total={sumTotal(projectedParts)} hint="Ordered or not yet purchased; still billable in advance. Billed at the estimated selling-price snapshot; purchasing and inventory are not changed, and receiving later never re-opens invoiced qty.">
          <div className="space-y-2"><BillablePartsGroup groups={projectedGroups} expandedGroups={expandedGroups} toggleGroup={toggleGroup} keyPrefix="projected" sel={sel} /></div>
        </BillableSection>
        <BillableSection title="Services & Approved Allowances" count={services.length} total={sumTotal(services)}>
          <BillableServicesGroup items={services} expanded={!!expandedGroups.__services__} onToggleExpand={() => toggleGroup("__services__")} expandedServices={expandedServices} toggleServiceExpand={toggleServiceExpand} sel={sel} />
        </BillableSection>
      </div>

      <BillableEligibilityPanel summary={data?.summary} allocated={data?.allocated_items} excluded={data?.excluded_items} />

      {data?.summary?.labor_unpriced_hours > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-amber-400 bg-amber-950/20 border border-amber-800/40 rounded-lg">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {data.summary.labor_unpriced_hours}h of billable labor can't be invoiced until a billing rate is set for this project.
        </div>
      )}

      {selectedItems.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-green-900/20 border border-green-800/30 rounded-lg">
          <span className="text-green-400 text-sm">{selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""} selected</span>
          <span className="text-green-400 font-medium">{formatCurrencyUSD(sumTotal(selectedItems))}</span>
        </div>
      )}
    </div>
  );
}