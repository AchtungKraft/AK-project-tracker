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
  Plus, Trash2, Star, ExternalLink, Check, Loader2, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * PartVendorSourcesSection — Displays and manages PartVendorSource records for a part.
 * On preferred change: syncs Part.default_vendor_id + Part.cost.
 * On save: upserts sources, deletes removed ones.
 */
export default function PartVendorSourcesSection({
  partId,
  vendors = [],
  isEditing,
  onPreferredChange, // (vendor_id, unit_cost) => void — syncs to Part form
}) {
  const queryClient = useQueryClient();
  const [localSources, setLocalSources] = useState(null); // null = not initialized
  const [deletedIds, setDeletedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  // Fetch existing sources
  const { data: serverSources = [], isLoading } = useQuery({
    queryKey: ["partVendorSources", partId],
    queryFn: async () => {
      if (!partId) return [];
      return base44.entities.PartVendorSource.filter({ part_id: partId });
    },
    enabled: Boolean(partId),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Initialize local state from server data
  useEffect(() => {
    if (serverSources.length > 0 || (localSources === null && !isLoading)) {
      setLocalSources(serverSources.map(s => ({ ...s, _isNew: false })));
      setDeletedIds([]);
    }
  }, [serverSources, isLoading]);

  const sources = localSources || [];
  const cheapestCost = sources.length > 0
    ? Math.min(...sources.filter(s => (s.unit_cost || 0) > 0).map(s => s.unit_cost))
    : 0;

  const handleAdd = () => {
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
        is_preferred: (prev || []).length === 0, // first source is auto-preferred
        is_active: true,
      },
    ]);
  };

  const handleRemove = (index) => {
    setLocalSources(prev => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (removed.id) setDeletedIds(d => [...d, removed.id]);
      // If removed was preferred and there are others, make first one preferred
      if (removed.is_preferred && updated.length > 0) {
        updated[0].is_preferred = true;
        const v = vendors.find(v => v.id === updated[0].vendor_id);
        onPreferredChange?.(updated[0].vendor_id, updated[0].unit_cost);
      }
      return updated;
    });
  };

  const handleFieldChange = (index, field, value) => {
    setLocalSources(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSetPreferred = (index) => {
    setLocalSources(prev => {
      const updated = prev.map((s, i) => ({
        ...s,
        is_preferred: i === index,
      }));
      const preferred = updated[index];
      onPreferredChange?.(preferred.vendor_id, preferred.unit_cost);
      return updated;
    });
  };

  // Save all sources (called from parent via ref or explicit button)
  const saveAll = async () => {
    if (!partId) return;
    setSaving(true);

    // Delete removed sources
    for (const id of deletedIds) {
      await base44.entities.PartVendorSource.delete(id);
    }

    // Upsert remaining
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

  // Expose save method so parent can call it on Part save
  useEffect(() => {
    if (window.__partVendorSourcesSave) delete window.__partVendorSourcesSave;
    window.__partVendorSourcesSave = saveAll;
    return () => { delete window.__partVendorSourcesSave; };
  }, [localSources, deletedIds, partId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading vendor sources...
      </div>
    );
  }

  // View mode
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
        {sources.map((s) => {
          const v = vendors.find(v => v.id === s.vendor_id);
          const isCheapest = s.unit_cost > 0 && s.unit_cost <= cheapestCost && sources.length > 1;
          return (
            <SourceViewRow
              key={s.id || s._tempId}
              source={s}
              vendorName={v?.vendor_name || "Unknown"}
              isCheapest={isCheapest}
            />
          );
        })}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="space-y-2">
      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((s, idx) => (
            <SourceEditRow
              key={s.id || s._tempId}
              source={s}
              vendors={vendors}
              isCheapest={s.unit_cost > 0 && s.unit_cost <= cheapestCost && sources.length > 1}
              onFieldChange={(field, val) => handleFieldChange(idx, field, val)}
              onSetPreferred={() => handleSetPreferred(idx)}
              onRemove={() => handleRemove(idx)}
            />
          ))}
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
function SourceEditRow({ source, vendors, isCheapest, onFieldChange, onSetPreferred, onRemove }) {
  const activeVendors = vendors.filter(v => v.active !== false);

  return (
    <div className={cn(
      "p-3 rounded-lg border space-y-2",
      source.is_preferred ? "bg-yellow-900/10 border-yellow-700/30" : "bg-gray-800/30 border-gray-700/50"
    )}>
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