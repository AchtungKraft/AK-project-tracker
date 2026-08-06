import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Package, Plus, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useReferenceData } from "@/components/common/useReferenceData";

export default function AddPartsToGroupModal({ groupId, existingPartIds, onClose }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const { categories } = useReferenceData();

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date"),
  });

  const existingSet = useMemo(() => new Set(existingPartIds), [existingPartIds]);

  const parentCategories = useMemo(() => {
    return categories.filter(c => !c.parent_id && c.active).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [categories]);

  const filtered = useMemo(() => {
    let result = parts.filter(p => !p.is_archived);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        p.part_name?.toLowerCase().includes(s) ||
        p.vendor_part_number?.toLowerCase().includes(s) ||
        p.notes?.toLowerCase().includes(s)
      );
    }
    if (categoryFilter !== "all") {
      const catIds = new Set([categoryFilter]);
      categories.filter(c => c.parent_id === categoryFilter).forEach(c => catIds.add(c.id));
      result = result.filter(p => catIds.has(p.part_category_id));
    }
    return result;
  }, [parts, search, categoryFilter, categories]);

  const toggle = (partId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId); else next.add(partId);
      return next;
    });
  };

  const handleAdd = async () => {
    const newParts = [...selected].filter(id => !existingSet.has(id));
    if (newParts.length === 0) {
      toast({ title: "No new parts to add", description: "Selected parts are already in the group." });
      return;
    }

    setSaving(true);
    const maxOrder = 0; // New items go to end
    await base44.entities.PartGroupItem.bulkCreate(
      newParts.map((partId, idx) => ({
        part_group_id: groupId,
        part_id: partId,
        quantity: 1,
        sort_order: maxOrder + idx + 1,
        is_optional: false,
      }))
    );

    const skipped = [...selected].filter(id => existingSet.has(id)).length;
    queryClient.invalidateQueries({ queryKey: ["partGroupItems", groupId] });
    queryClient.invalidateQueries({ queryKey: ["partGroupItems"] });

    let desc = `${newParts.length} part${newParts.length !== 1 ? "s" : ""} added`;
    if (skipped > 0) desc += ` · ${skipped} already in group`;
    toast({ title: "Parts added", description: desc });
    setSaving(false);
    onClose();
  };

  const duplicateCount = [...selected].filter(id => existingSet.has(id)).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Parts to Group</DialogTitle>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="flex items-center gap-2 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by name, part number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9"
              autoFocus
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {parentCategories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Duplicate Warning */}
        {duplicateCount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-yellow-950/30 border border-yellow-800/50 rounded text-xs text-yellow-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {duplicateCount} selected part{duplicateCount !== 1 ? "s are" : " is"} already in this group and will be skipped.
          </div>
        )}

        {/* Parts List */}
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 border rounded border-gray-800 p-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No matching parts found.</div>
          ) : (
            filtered.slice(0, 100).map(part => {
              const isExisting = existingSet.has(part.id);
              const isSelected = selected.has(part.id);
              const photo = part.featured_photo || part.photos?.[0];

              return (
                <label
                  key={part.id}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                    isSelected ? "bg-red-950/30 border border-red-800/50" : "hover:bg-gray-800/50",
                    isExisting && !isSelected && "opacity-60"
                  )}
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => toggle(part.id)} />
                  <div className="w-8 h-8 flex-shrink-0 bg-gray-800 rounded overflow-hidden">
                    {photo ? (
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package className="w-3.5 h-3.5 text-gray-600" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{part.part_name}</div>
                    {part.vendor_part_number && (
                      <div className="text-[11px] text-gray-500 font-mono">{part.vendor_part_number}</div>
                    )}
                  </div>
                  {isExisting && (
                    <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400 shrink-0">Already added</Badge>
                  )}
                </label>
              );
            })
          )}
          {filtered.length > 100 && (
            <div className="text-center py-2 text-xs text-gray-500">Showing first 100 results. Refine your search.</div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <div className="text-xs text-gray-400 mr-auto">
            {selected.size} selected{duplicateCount > 0 ? ` (${selected.size - duplicateCount} new)` : ""}
          </div>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleAdd}
            disabled={saving || selected.size === 0 || selected.size === duplicateCount}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            {saving ? "Adding..." : `Add ${Math.max(0, selected.size - duplicateCount)} Part${selected.size - duplicateCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}