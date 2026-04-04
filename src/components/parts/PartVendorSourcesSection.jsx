import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Star, ExternalLink, Loader2, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * PartVendorSourcesSection — UNIFIED component for Add Part + Edit Part.
 *
 * mode="create" → local-only state, parent owns sources array via props
 * mode="edit"   → fetches from DB, exposes save via window.__partVendorSourcesSave
 *
 * Guarantees:
 * 1. Single preferred source (auto-enforced)
 * 2. No duplicate vendor_id + order_url combos
 * 3. Only PART vendors in selector
 */

/* ─── Duplicate check helper ─── */
function hasDuplicate(sources, index, vendorId, orderUrl) {
  if (!vendorId) return false;
  return sources.some((s, i) => {
    if (i === index) return false;
    const sameVendor = s.vendor_id === vendorId;
    const sameUrl = (s.order_url || '') === (orderUrl || '');
    return sameVendor && sameUrl;
  });
}

export default function PartVendorSourcesSection({
  // Shared props
  vendors = [],
  isEditing,
  onPreferredChange, // (vendor_id, unit_cost) => void — syncs to Part form

  // mode="edit" props
  partId,

  // mode="create" props
  mode = "edit", // "create" | "edit"
  sources: externalSources,
  onAdd: externalAdd,
  onRemove: externalRemove,
  onFieldChange: externalFieldChange,
  onSetPreferred: externalSetPreferred,
}) {
  const queryClient = useQueryClient();

  // ─── MODE: EDIT (existing part) ───
  const [localSources, setLocalSources] = useState(null);
  const [deletedIds, setDeletedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const { data: serverSources = [], isLoading } = useQuery({
    queryKey: ["partVendorSources", partId],
    queryFn: async () => {
      if (!partId) return [];
      return base44.entities.PartVendorSource.filter({ part_id: partId });
    },
    enabled: mode === "edit" && Boolean(partId),
    staleTime: 120000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (mode !== "edit") return;
    if (serverSources.length > 0 || (localSources === null && !isLoading)) {
      setLocalSources(serverSources.map(s => ({ ...s, _isNew: false })));
      setDeletedIds([]);
    }
  }, [serverSources, isLoading, mode]);

  // Determine active source list
  const sources = mode === "create"
    ? (externalSources || [])
    : (localSources || []);

  const cheapestCost = sources.length > 0
    ? Math.min(...sources.filter(s => (s.unit_cost || 0) > 0).map(s => s.unit_cost))
    : 0;

  // ─── HANDLERS (edit mode only — create mode delegates to parent) ───

  const handleAdd = () => {
    if (mode === "create") {
      externalAdd?.();
      return;
    }
    setLocalSources(prev => [
      ...(prev || []),
      {
        _tempId: `new_${Date.now()}`,
        _isNew: true,
        part_id: partId,
        vendor_id: "",
        vendor_part_number: "",
        unit_cost: 0,
        order_url: "",
        is_preferred: (prev || []).length === 0,
        is_active: true,
      },
    ]);
  };

  const handleRemove = (index) => {
    if (mode === "create") {
      externalRemove?.(index);
      return;
    }
    setLocalSources(prev => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (removed.id) setDeletedIds(d => [...d, removed.id]);
      if (removed.is_preferred && updated.length > 0) {
        updated[0].is_preferred = true;
        onPreferredChange?.(updated[0].vendor_id, updated[0].unit_cost);
      }
      return updated;
    });
  };

  const handleFieldChange = (index, field, value) => {
    if (mode === "create") {
      externalFieldChange?.(index, field, value);
      return;
    }
    setLocalSources(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSetPreferred = (index) => {
    if (mode === "create") {
      externalSetPreferred?.(index);
      return;
    }
    setLocalSources(prev => {
      const updated = prev.map((s, i) => ({ ...s, is_preferred: i === index }));
      const preferred = updated[index];
      onPreferredChange?.(preferred.vendor_id, preferred.unit_cost);
      return updated;
    });
  };

  // ─── SAVE (edit mode only) ───
  const saveAll = async () => {
    if (!partId || mode !== "edit") return;

    // GUARD: Enforce single preferred
    const preferredCount = (localSources || []).filter(s => s.is_preferred).length;
    if (preferredCount > 1) {
      toast.error("Multiple preferred sources detected — auto-resolving to first.");
      setLocalSources(prev => prev.map((s, i) => ({ ...s, is_preferred: i === 0 })));
    }

    // GUARD: Duplicate check
    for (let i = 0; i < (localSources || []).length; i++) {
      const s = localSources[i];
      if (hasDuplicate(localSources, i, s.vendor_id, s.order_url)) {
        toast.error(`Duplicate vendor+URL found: row ${i + 1}. Remove duplicates before saving.`);
        return;
      }
    }

    setSaving(true);

    for (const id of deletedIds) {
      await base44.entities.PartVendorSource.delete(id);
    }

    for (const s of (localSources || [])) {
      const data = {
        part_id: partId,
        vendor_id: s.vendor_id,
        vendor_part_number: s.vendor_part_number || "",
        unit_cost: s.unit_cost || 0,
        order_url: s.order_url || "",
        is_preferred: s.is_preferred || false,
        is_active: true,
      };

      if (s.id && !s._isNew) {
        await base44.entities.PartVendorSource.update(s.id, data);
      } else if (s.vendor_id) {
        await base44.entities.PartVendorSource.create(data);
      }
    }

    setDeletedIds([]);
    queryClient.invalidateQueries({ queryKey: ["partVendorSources", partId] });
    setSaving(false);
  };

  // Expose save for parent (edit mode)
  useEffect(() => {
    if (mode !== "edit") return;
    window.__partVendorSourcesSave = saveAll;
    return () => { delete window.__partVendorSourcesSave; };
  }, [localSources, deletedIds, partId, mode]);

  // ─── LOADING STATE (edit mode only) ───
  if (mode === "edit" && isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading vendor sources...
      </div>
    );
  }

  // ─── VIEW MODE ───
  if (!isEditing) {
    if (sources.length === 0) {
      return (
        <div className="text-sm text-gray-500 py-2">
          No vendor sources configured
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {sources.map((s, idx) => {
          const v = vendors.find(v => v.id === s.vendor_id);
          const isCheapest = s.unit_cost > 0 && s.unit_cost <= cheapestCost && sources.length > 1;
          return (
            <SourceViewRow
              key={s.id || s._tempId || idx}
              source={s}
              vendorName={v?.vendor_name || "Unknown"}
              isCheapest={isCheapest}
            />
          );
        })}
      </div>
    );
  }

  // ─── EDIT MODE ───
  return (
    <div className="space-y-2">
      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((s, idx) => {
            const isDuplicate = hasDuplicate(sources, idx, s.vendor_id, s.order_url);
            return (
              <SourceEditRow
                key={s.id || s._tempId || idx}
                source={s}
                vendors={vendors}
                isCheapest={s.unit_cost > 0 && s.unit_cost <= cheapestCost && sources.length > 1}
                isDuplicate={isDuplicate}
                onFieldChange={(field, val) => handleFieldChange(idx, field, val)}
                onSetPreferred={() => handleSetPreferred(idx)}
                onRemove={() => handleRemove(idx)}
              />
            );
          })}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="border-gray-600 text-gray-300 gap-1 w-full"
      >
        <Plus className="w-3 h-3" />
        Add Vendor Source
      </Button>
    </div>
  );
}

/* ─── View Row ─── */
function SourceViewRow({ source, vendorName, isCheapest }) {
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg border",
      source.is_preferred ? "bg-yellow-900/10 border-yellow-700/30" : "bg-gray-800/30 border-gray-700/50"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {source.is_preferred && (
            <Star className="w-3 h-3 text-yellow-400 shrink-0" fill="currentColor" />
          )}
          <span className="text-sm text-white font-medium truncate">{vendorName}</span>
          {isCheapest && (
            <Badge className="bg-green-900/40 text-green-400 border-green-700 text-[9px] gap-0.5">
              <TrendingDown className="w-2.5 h-2.5" />
              BEST
            </Badge>
          )}
        </div>
        {source.vendor_part_number && (
          <span className="text-[11px] text-gray-500">SKU: {source.vendor_part_number}</span>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className={cn(
          "text-sm font-mono font-medium",
          source.unit_cost > 0 ? "text-emerald-400" : "text-gray-500"
        )}>
          {source.unit_cost > 0 ? formatCurrencyUSD(source.unit_cost) : "—"}
        </span>
      </div>
      {source.order_url && (
        <a
          href={source.order_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

/* ─── Edit Row ─── */
function SourceEditRow({ source, vendors, isCheapest, isDuplicate, onFieldChange, onSetPreferred, onRemove }) {
  const activeVendors = vendors.filter(v => v.active !== false && v.vendor_type === 'PART');

  return (
    <div className={cn(
      "p-3 rounded-lg border space-y-2",
      isDuplicate ? "bg-red-900/20 border-red-700/50" : 
      source.is_preferred ? "bg-yellow-900/10 border-yellow-700/30" : "bg-gray-800/30 border-gray-700/50"
    )}>
      {isDuplicate && (
        <div className="text-[10px] text-red-400 font-semibold">
          ⚠ Duplicate vendor + URL — remove before saving
        </div>
      )}
      {/* Row 1: Vendor + preferred + delete */}
      <div className="flex items-center gap-2">
        <Select
          value={source.vendor_id || "none"}
          onValueChange={(val) => onFieldChange("vendor_id", val === "none" ? "" : val)}
        >
          <SelectTrigger className="flex-1 bg-gray-800 border-gray-700 text-white h-8 text-sm">
            <SelectValue placeholder="Select vendor..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select vendor...</SelectItem>
            {activeVendors.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="icon"
          variant={source.is_preferred ? "default" : "ghost"}
          className={cn(
            "h-8 w-8 shrink-0",
            source.is_preferred
              ? "bg-yellow-600 hover:bg-yellow-700 text-white"
              : "text-gray-400 hover:text-yellow-400"
          )}
          onClick={onSetPreferred}
          title={source.is_preferred ? "Preferred source" : "Set as preferred"}
        >
          <Star className="w-3.5 h-3.5" fill={source.is_preferred ? "currentColor" : "none"} />
        </Button>

        {isCheapest && (
          <Badge className="bg-green-900/40 text-green-400 border-green-700 text-[9px] shrink-0">
            BEST
          </Badge>
        )}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-red-400 hover:text-red-300 hover:bg-red-900/30"
          onClick={onRemove}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Row 2: Part #, cost, URL */}
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="Vendor Part #"
          value={source.vendor_part_number || ""}
          onChange={(e) => onFieldChange("vendor_part_number", e.target.value)}
          className="bg-gray-800 border-gray-700 text-white h-7 text-xs"
        />
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="Unit cost"
          value={source.unit_cost || ""}
          onChange={(e) => onFieldChange("unit_cost", parseFloat(e.target.value) || 0)}
          className="bg-gray-800 border-gray-700 text-white h-7 text-xs"
        />
        <Input
          placeholder="Order URL"
          value={source.order_url || ""}
          onChange={(e) => onFieldChange("order_url", e.target.value)}
          className="bg-gray-800 border-gray-700 text-white h-7 text-xs"
        />
      </div>
    </div>
  );
}