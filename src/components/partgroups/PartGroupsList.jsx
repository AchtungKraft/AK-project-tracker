import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Package, Archive, ArchiveRestore,
  Copy, MoreVertical, Layers,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import PartGroupFormModal from "./PartGroupFormModal";

const STATUS_COLORS = {
  ACTIVE: "bg-green-600",
  DRAFT: "bg-yellow-600",
  ARCHIVED: "bg-gray-600",
};

export default function PartGroupsList({ onGroupClick }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editGroup, setEditGroup] = useState(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["partGroups"],
    queryFn: () => base44.entities.PartGroup.list("-updated_date"),
  });

  const { data: items = [] } = useQuery({
    queryKey: ["partGroupItems"],
    queryFn: () => base44.entities.PartGroupItem.list(),
  });

  // Build item counts per group
  const groupStats = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.part_group_id)) {
        map.set(item.part_group_id, { count: 0, totalQty: 0 });
      }
      const s = map.get(item.part_group_id);
      s.count += 1;
      s.totalQty += item.quantity || 1;
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    let result = groups;

    // Status filter
    if (statusFilter === "active") {
      result = result.filter(g => g.status !== "ARCHIVED");
    } else if (statusFilter !== "all") {
      result = result.filter(g => g.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter(g => g.category === categoryFilter);
    }

    // Search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(g =>
        g.name?.toLowerCase().includes(s) ||
        g.group_code?.toLowerCase().includes(s) ||
        g.description?.toLowerCase().includes(s)
      );
    }

    // Sort
    if (sortBy === "name") {
      result = [...result].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else {
      result = [...result].sort((a, b) =>
        new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0)
      );
    }

    return result;
  }, [groups, statusFilter, categoryFilter, search, sortBy]);

  const usedCategories = useMemo(() => {
    const cats = new Set();
    groups.forEach(g => { if (g.category) cats.add(g.category); });
    return [...cats].sort();
  }, [groups]);

  const handleArchive = async (group) => {
    const isArchived = group.status === "ARCHIVED";
    await base44.entities.PartGroup.update(group.id, {
      status: isArchived ? "DRAFT" : "ARCHIVED",
      ...(isArchived ? {} : { archived_at: new Date().toISOString() }),
    });
    queryClient.invalidateQueries({ queryKey: ["partGroups"] });
    toast({ title: isArchived ? "Group restored" : "Group archived" });
  };

  const handleDuplicate = async (group) => {
    const newGroup = await base44.entities.PartGroup.create({
      name: `Copy of ${group.name}`,
      description: group.description,
      group_code: group.group_code ? `${group.group_code}-COPY` : undefined,
      image_url: group.image_url,
      status: "DRAFT",
      category: group.category,
      notes: group.notes,
      instructions: group.instructions,
    });

    const groupItems = items.filter(i => i.part_group_id === group.id);
    if (groupItems.length > 0) {
      await base44.entities.PartGroupItem.bulkCreate(
        groupItems.map(i => ({
          part_group_id: newGroup.id,
          part_id: i.part_id,
          quantity: i.quantity,
          sort_order: i.sort_order,
          section_name: i.section_name,
          notes: i.notes,
          is_optional: i.is_optional,
        }))
      );
    }

    queryClient.invalidateQueries({ queryKey: ["partGroups"] });
    queryClient.invalidateQueries({ queryKey: ["partGroupItems"] });
    toast({ title: "Group duplicated", description: `"${newGroup.name}" created as DRAFT` });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse h-20 bg-gray-800 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-black/40 backdrop-blur-xl border-b border-red-900/30">
        <div>
          <h2 className="text-lg font-bold text-white">Parts Groups</h2>
          <p className="text-xs text-gray-400">{filtered.length} group{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} size="sm" className="bg-red-600 hover:bg-red-700 gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create Group</span>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="p-3 border-b border-red-900/20 bg-gray-900/30 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search groups..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 bg-gray-900/50 border-gray-700 text-white text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-8 bg-gray-900/50 border-gray-700 text-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="ACTIVE">Active Only</SelectItem>
              <SelectItem value="DRAFT">Drafts</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {usedCategories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] h-8 bg-gray-900/50 border-gray-700 text-white text-xs hidden sm:flex">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {usedCategories.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[130px] h-8 bg-gray-900/50 border-gray-700 text-white text-xs hidden sm:flex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently Updated</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Layers className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">
              {groups.length === 0
                ? "No Parts Groups have been created yet."
                : "No matching groups found."}
            </p>
            {groups.length === 0 && (
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="bg-red-600 hover:bg-red-700 gap-2 mt-2">
                <Plus className="w-4 h-4" /> Create Parts Group
              </Button>
            )}
          </div>
        ) : (
          filtered.map(group => {
            const stats = groupStats.get(group.id) || { count: 0, totalQty: 0 };
            return (
              <div
                key={group.id}
                onClick={() => onGroupClick(group)}
                className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group/row"
              >
                {/* Image */}
                <div className="w-14 h-14 flex-shrink-0 bg-gray-800 rounded overflow-hidden">
                  {group.image_url ? (
                    <img src={group.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Layers className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-white text-sm font-medium truncate group-hover/row:text-red-400 transition-colors">
                      {group.name}
                    </h4>
                    <Badge className={cn("text-white text-[10px] px-1.5 py-0", STATUS_COLORS[group.status] || "bg-gray-600")}>
                      {group.status}
                    </Badge>
                  </div>
                  {group.group_code && (
                    <div className="text-xs text-gray-500 font-mono">{group.group_code}</div>
                  )}
                  {group.description && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">{group.description}</div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs shrink-0">
                  {group.category && (
                    <div className="text-gray-400 hidden md:block">{group.category}</div>
                  )}
                  <div className="text-center min-w-[50px]">
                    <div className="text-gray-500 mb-0.5">Parts</div>
                    <div className="text-white font-semibold">{stats.count}</div>
                  </div>
                  <div className="text-center min-w-[50px] hidden sm:block">
                    <div className="text-gray-500 mb-0.5">Qty</div>
                    <div className="text-white font-semibold">{stats.totalQty}</div>
                  </div>
                  <div className="text-gray-500 hidden lg:block min-w-[80px] text-right">
                    {group.updated_date
                      ? new Date(group.updated_date).toLocaleDateString()
                      : ""}
                  </div>
                </div>

                {/* Actions */}
                <div onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditGroup(group)} className="gap-2 cursor-pointer">
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(group)} className="gap-2 cursor-pointer">
                        <Copy className="w-4 h-4" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(group)} className="gap-2 cursor-pointer">
                        {group.status === "ARCHIVED" ? (
                          <><ArchiveRestore className="w-4 h-4" /> Restore</>
                        ) : (
                          <><Archive className="w-4 h-4" /> Archive</>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showCreateModal && (
        <PartGroupFormModal onClose={() => setShowCreateModal(false)} />
      )}
      {editGroup && (
        <PartGroupFormModal group={editGroup} onClose={() => setEditGroup(null)} />
      )}
    </div>
  );
}