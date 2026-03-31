import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, ShoppingCart, Package, Wrench, CheckCircle2, AlertTriangle, Search, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import CommitmentActionCard from "./CommitmentActionCard";
import { resolveNextAction } from "./CommitmentNextAction";

/**
 * GlobalActionQueue - Groups all commitments by next action across projects.
 * 
 * Groups:
 * - ALLOCATE: Stock available, needs allocation
 * - CREATE_PO: Gap > 0, needs purchase order
 * - RECEIVE: On order, waiting for delivery
 * - INSTALL: Reserved, ready to install
 * - COMPLETE: Fully installed
 */

const ACTION_GROUPS = [
  { key: 'ALLOCATE', label: 'Needs Allocation', icon: Layers, color: 'border-l-cyan-500', bgColor: 'bg-cyan-900/20', textColor: 'text-cyan-400' },
  { key: 'CREATE_PO', label: 'Needs Ordering', icon: ShoppingCart, color: 'border-l-blue-500', bgColor: 'bg-blue-900/20', textColor: 'text-blue-400' },
  { key: 'RECEIVE', label: 'Waiting on Receiving', icon: Package, color: 'border-l-purple-500', bgColor: 'bg-purple-900/20', textColor: 'text-purple-400' },
  { key: 'INSTALL', label: 'Ready to Install', icon: Wrench, color: 'border-l-emerald-500', bgColor: 'bg-emerald-900/20', textColor: 'text-emerald-400' },
  { key: 'COMPLETE', label: 'Complete', icon: CheckCircle2, color: 'border-l-gray-600', bgColor: 'bg-gray-900/20', textColor: 'text-gray-400' },
];

export default function GlobalActionQueue({
  items = [],
  onAction,
  onPartClick,
  onBatchPO,
  selectedItems,
  onItemSelect,
  isLoading,
  projects = [],
  searchTerm,
  onSearchChange,
  projectFilter,
  onProjectFilterChange,
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set(['ALLOCATE', 'CREATE_PO', 'RECEIVE', 'INSTALL']));
  const [hideComplete, setHideComplete] = useState(true);

  // Group items by next action
  const grouped = useMemo(() => {
    const groups = {};
    ACTION_GROUPS.forEach(g => { groups[g.key] = []; });
    groups['OTHER'] = [];

    let filtered = items;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter(i =>
        i.part?.part_name?.toLowerCase().includes(s) ||
        i.project_name?.toLowerCase().includes(s) ||
        i.part?.vendor_part_number?.toLowerCase().includes(s)
      );
    }
    if (projectFilter && projectFilter !== 'all') {
      filtered = filtered.filter(i => i.project_id === projectFilter);
    }

    for (const item of filtered) {
      if (item.commitment_status === 'cancelled') continue;
      const { action } = resolveNextAction(item);
      if (groups[action]) groups[action].push(item);
      else groups['OTHER'] = groups['OTHER'] || [];
    }
    return groups;
  }, [items, searchTerm, projectFilter]);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const visibleGroups = ACTION_GROUPS.filter(g => {
    if (hideComplete && g.key === 'COMPLETE') return false;
    return (grouped[g.key]?.length || 0) > 0;
  });

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex items-center gap-2 flex-wrap">
        {ACTION_GROUPS.filter(g => g.key !== 'COMPLETE').map(g => {
          const count = grouped[g.key]?.length || 0;
          const Icon = g.icon;
          return (
            <Badge key={g.key} variant="outline"
              className={cn("gap-1 text-xs", count > 0 ? g.textColor : "text-gray-600", count > 0 ? g.bgColor : "")}
            >
              <Icon className="w-3 h-3" /> {g.label}: {count}
            </Badge>
          );
        })}
      </div>

      {/* Action groups */}
      {visibleGroups.length === 0 ? (
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="text-green-400 font-medium">All caught up!</p>
            <p className="text-xs text-gray-500">No items need attention</p>
          </CardContent>
        </Card>
      ) : (
        visibleGroups.map(group => {
          const groupItems = grouped[group.key] || [];
          const isExpanded = expandedGroups.has(group.key);
          const Icon = group.icon;

          return (
            <Card key={group.key} className={cn("bg-black/40 border-gray-800 overflow-hidden border-l-4", group.color)}>
              <div
                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-800/30 transition-colors"
                onClick={() => toggleGroup(group.key)}
              >
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                <Icon className={cn("w-4 h-4", group.textColor)} />
                <span className="text-sm font-semibold text-white flex-1">{group.label}</span>
                <Badge className={cn("text-[10px]", group.bgColor, group.textColor)}>{groupItems.length}</Badge>

                {/* Batch PO button for ordering group */}
                {group.key === 'CREATE_PO' && groupItems.length > 0 && onBatchPO && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-700 text-blue-400 hover:bg-blue-900/30 h-6 text-[10px]"
                    onClick={(e) => { e.stopPropagation(); onBatchPO(groupItems); }}
                  >
                    <ShoppingCart className="w-3 h-3 mr-1" /> Batch PO ({groupItems.length})
                  </Button>
                )}
              </div>

              {isExpanded && (
                <div className="border-t border-gray-800">
                  {groupItems.map(item => (
                    <CommitmentActionCard
                      key={item.id || item.commitment_id}
                      commitment={item}
                      isSelected={selectedItems?.has(item.id || item.commitment_id)}
                      onSelect={() => onItemSelect?.(item.id || item.commitment_id)}
                      onAction={onAction}
                      onPartClick={onPartClick}
                      isLoading={isLoading}
                      showProject
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}