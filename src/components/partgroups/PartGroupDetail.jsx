import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Plus, Printer, Edit, Package, Layers,
  ChevronDown, ChevronRight, Trash2, GripVertical, Filter, X,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, getPartRetailEffectiveSafe } from "@/components/supply/pricingHelpers";
import { buildCategoryLookups, getCategoryPathLabel, getAllDescendantIds } from "@/lib/categoryTreeHelpers";
import { useReferenceData } from "@/components/common/useReferenceData";
import PartGroupFormModal from "./PartGroupFormModal";
import AddPartsToGroupModal from "./AddPartsToGroupModal";
import PartGroupItemRow from "./PartGroupItemRow";
import PartGroupCategoryFilter from "./PartGroupCategoryFilter";
import { buildPartGroupPrintHTML } from "./partGroupPrint";
import { openPrintWindow } from "@/components/parts/print/printHelpers";

const STATUS_COLORS = {
  ACTIVE: "bg-green-600",
  DRAFT: "bg-yellow-600",
  ARCHIVED: "bg-gray-600",
};

export default function PartGroupDetail({ groupId, onBack }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddParts, setShowAddParts] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [filterCategoryId, setFilterCategoryId] = useState(null);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  const { vendorsMap, categories } = useReferenceData();
  const catLookups = useMemo(() => buildCategoryLookups(categories), [categories]);

  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: ["partGroup", groupId],
    queryFn: async () => {
      const groups = await base44.entities.PartGroup.filter({ id: groupId });
      return groups[0] || null;
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["partGroupItems", groupId],
    queryFn: () => base44.entities.PartGroupItem.filter({ part_group_id: groupId }),
  });

  const { data: allParts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date"),
  });

  const { data: partsInventoryView = [] } = useQuery({
    queryKey: ["partsInventoryView"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getPartsInventoryView", {});
      return res.data?.parts || [];
    },
  });

  const inventoryViewMap = useMemo(() => {
    const m = new Map();
    partsInventoryView.forEach(p => m.set(p.part_id, p));
    return m;
  }, [partsInventoryView]);

  const partsMap = useMemo(() => new Map(allParts.map(p => [p.id, p])), [allParts]);

  // Build enriched items with part data
  const enrichedItems = useMemo(() => {
    return items
      .map(item => {
        const part = partsMap.get(item.part_id);
        if (!part) return null;
        const inv = inventoryViewMap.get(item.part_id);
        const unitCost = part.cost || 0;
        const extCost = unitCost * (item.quantity || 1);
        return { ...item, part, inv, unitCost, extCost };
      })
      .filter(Boolean)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [items, partsMap, inventoryViewMap]);

  // Filter by category (recursive)
  const filteredItems = useMemo(() => {
    if (!filterCategoryId) return enrichedItems;
    const catIds = getAllDescendantIds(filterCategoryId, catLookups.childrenByParentId);
    return enrichedItems.filter(item => {
      const pcId = item.part?.part_category_id;
      return pcId && catIds.has(pcId);
    });
  }, [enrichedItems, filterCategoryId, catLookups]);

  // Active filter label
  const filterLabel = useMemo(() => {
    if (!filterCategoryId || !catLookups.byId[filterCategoryId]) return null;
    return getCategoryPathLabel(filterCategoryId, catLookups.byId);
  }, [filterCategoryId, catLookups]);

  // Group by section
  const sections = useMemo(() => {
    const sectionMap = new Map();
    for (const item of filteredItems) {
      const section = item.section_name || "General Parts";
      if (!sectionMap.has(section)) sectionMap.set(section, []);
      sectionMap.get(section).push(item);
    }
    return Array.from(sectionMap.entries());
  }, [filteredItems]);

  // Summary stats
  const summary = useMemo(() => {
    let requiredCost = 0, optionalCost = 0, requiredCount = 0, optionalCount = 0;
    for (const item of enrichedItems) {
      if (item.is_optional) {
        optionalCost += item.extCost;
        optionalCount++;
      } else {
        requiredCost += item.extCost;
        requiredCount++;
      }
    }
    return {
      uniqueParts: enrichedItems.length,
      totalQty: enrichedItems.reduce((s, i) => s + (i.quantity || 1), 0),
      requiredCount,
      optionalCount,
      requiredCost,
      optionalCost,
      totalCost: requiredCost + optionalCost,
    };
  }, [enrichedItems]);

  const handleRemoveItem = async (itemId) => {
    await base44.entities.PartGroupItem.delete(itemId);
    queryClient.invalidateQueries({ queryKey: ["partGroupItems", groupId] });
    queryClient.invalidateQueries({ queryKey: ["partGroupItems"] });
    toast({ title: "Part removed from group" });
  };

  const handleUpdateItem = async (itemId, updates) => {
    await base44.entities.PartGroupItem.update(itemId, updates);
    queryClient.invalidateQueries({ queryKey: ["partGroupItems", groupId] });
    queryClient.invalidateQueries({ queryKey: ["partGroupItems"] });
  };

  const handlePrint = () => {
    const html = buildPartGroupPrintHTML({
      group,
      enrichedItems,
      sections,
      summary,
      vendorsMap,
      inventoryViewMap,
      catLookups,
    });
    openPrintWindow(html);
  };

  const toggleSection = (name) => {
    setExpandedSections(prev => ({ ...prev, [name]: prev[name] === false ? true : (prev[name] === undefined ? false : !prev[name]) }));
  };

  if (groupLoading || itemsLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse h-8 bg-gray-800 rounded w-1/3" />
        <div className="animate-pulse h-20 bg-gray-800 rounded" />
        <div className="animate-pulse h-40 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-400">Group not found</p>
        <Button onClick={onBack} variant="outline" size="sm" className="mt-4">Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
        <div className="flex items-center gap-3 mb-2">
          <Button onClick={onBack} variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white truncate">{group.name}</h2>
              <Badge className={cn("text-white text-[10px] px-1.5 py-0", STATUS_COLORS[group.status])}>
                {group.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              {group.group_code && <span className="font-mono">{group.group_code}</span>}
              {group.category && <span>{group.category}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowEditModal(true)} variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button onClick={handlePrint} variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <Button onClick={() => setShowAddParts(true)} size="sm" className="bg-red-600 hover:bg-red-700 h-8 gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Parts
            </Button>
          </div>
        </div>

        {group.description && (
          <p className="text-sm text-gray-300 ml-11">{group.description}</p>
        )}
      </div>

      {/* Category Filter Strip */}
      {enrichedItems.length > 0 && (
        <div className="px-3 py-1.5 bg-gray-900/30 border-b border-gray-800/50 flex items-center gap-2">
          <Button
            variant={showCategoryFilter ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowCategoryFilter(!showCategoryFilter)}
            className="h-7 text-xs gap-1.5"
          >
            <Filter className="w-3 h-3" />
            {filterLabel ? "Filtered" : "Filter by Category"}
          </Button>
          {filterLabel && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="text-gray-600">→</span>
              <span className="truncate max-w-[300px]" title={filterLabel}>{filterLabel}</span>
              <button onClick={() => setFilterCategoryId(null)} className="text-gray-500 hover:text-red-400 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {filterCategoryId && (
            <span className="text-[11px] text-gray-500 ml-auto">{filteredItems.length} of {enrichedItems.length} parts</span>
          )}
        </div>
      )}

      {/* Summary Strip */}
      <div className="px-3 py-2 bg-gray-900/50 border-b border-red-900/20 flex flex-wrap gap-4 text-xs">
        <div><span className="text-gray-500">Parts:</span> <span className="text-white font-semibold">{summary.uniqueParts}</span></div>
        <div><span className="text-gray-500">Qty:</span> <span className="text-white font-semibold">{summary.totalQty}</span></div>
        <div><span className="text-gray-500">Required:</span> <span className="text-white font-semibold">{summary.requiredCount}</span></div>
        <div><span className="text-gray-500">Optional:</span> <span className="text-yellow-400 font-semibold">{summary.optionalCount}</span></div>
        <div className="hidden sm:block"><span className="text-gray-500">Required Est:</span> <span className="text-green-400 font-mono font-semibold">{formatCurrency(summary.requiredCost)}</span></div>
        <div className="hidden sm:block"><span className="text-gray-500">Optional Est:</span> <span className="text-yellow-400 font-mono font-semibold">{formatCurrency(summary.optionalCost)}</span></div>
        <div><span className="text-gray-500">Total Est:</span> <span className="text-white font-mono font-semibold">{formatCurrency(summary.totalCost)}</span></div>
      </div>

      {/* Parts List with optional category filter panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {showCategoryFilter && (
          <PartGroupCategoryFilter
            enrichedItems={enrichedItems}
            categories={categories}
            catLookups={catLookups}
            selectedCategoryId={filterCategoryId}
            onSelect={setFilterCategoryId}
            onClose={() => setShowCategoryFilter(false)}
          />
        )}
        <div className={cn("flex-1 overflow-y-auto p-3", showCategoryFilter && "border-l border-gray-800")}>
          {enrichedItems.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">This Parts Group does not contain any parts yet.</p>
              <Button onClick={() => setShowAddParts(true)} size="sm" className="bg-red-600 hover:bg-red-700 gap-2 mt-2">
                <Plus className="w-4 h-4" /> Add Parts
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16">
              <Filter className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No parts match this category filter.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilterCategoryId(null)}>Clear Filter</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map(([sectionName, sectionItems]) => {
                const isExpanded = expandedSections[sectionName] !== false;
                const sectionCost = sectionItems.reduce((s, i) => s + i.extCost, 0);
                return (
                  <div key={sectionName}>
                    {sections.length > 1 && (
                      <button
                        onClick={() => toggleSection(sectionName)}
                        className="flex items-center gap-2 w-full p-2 mb-2 bg-gray-900/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <span className="text-sm font-semibold text-white flex-1 text-left uppercase tracking-wide">{sectionName}</span>
                        <span className="text-xs text-gray-400">{sectionItems.length} parts · {formatCurrency(sectionCost)}</span>
                      </button>
                    )}
                    {isExpanded && (
                      <div className="space-y-1.5">
                        {sectionItems.map(item => (
                          <PartGroupItemRow
                            key={item.id}
                            item={item}
                            sections={sections.map(([name]) => name).filter(n => n !== "General Parts")}
                            vendorsMap={vendorsMap}
                            catLookups={catLookups}
                            onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                            onRemove={() => handleRemoveItem(item.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showEditModal && (
        <PartGroupFormModal
          group={group}
          onClose={() => {
            setShowEditModal(false);
            queryClient.invalidateQueries({ queryKey: ["partGroup", groupId] });
          }}
        />
      )}

      {showAddParts && (
        <AddPartsToGroupModal
          groupId={groupId}
          groupName={group?.name}
          existingPartIds={items.map(i => i.part_id)}
          onClose={() => {
            setShowAddParts(false);
            queryClient.invalidateQueries({ queryKey: ["partGroupItems", groupId] });
            queryClient.invalidateQueries({ queryKey: ["partGroupItems"] });
          }}
        />
      )}
    </div>
  );
}