import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, Filter, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATE_FILTERS, COMPLETED_WINDOWS } from "./workloadConfig";

export default function WorkloadFilters({
  searchValue,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  completedWindow,
  onCompletedWindowChange,
  filters,
  onFilterChange,
  projects,
  phases,
  teamMembers,
  stats,
}) {
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateFilter !== "all") count++;
    if (filters.projectId) count++;
    if (filters.phaseId) count++;
    if (filters.technicianId) count++;
    if (filters.hasPriority) count++;
    if (filters.hasBlockers) count++;
    if (filters.blocksDownstream) count++;
    if (filters.unassigned) count++;
    if (searchValue) count++;
    return count;
  }, [dateFilter, filters, searchValue]);

  const activeTeam = useMemo(() => (teamMembers || []).filter(tm => tm.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [teamMembers]);

  const clearAll = () => {
    onSearchChange("");
    onDateFilterChange("all");
    onFilterChange({});
  };

  return (
    <div className="bg-black/40 backdrop-blur-xl border border-gray-800 rounded-lg p-3 space-y-2">
      {/* Row 1: Search + date filter + completed window */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search tasks, projects, blockers..."
            className="h-8 pl-7 pr-7 text-xs bg-gray-900/50 border-gray-700 text-white placeholder:text-gray-500"
          />
          {searchValue && (
            <button onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Date filter */}
        <Select value={dateFilter} onValueChange={onDateFilterChange}>
          <SelectTrigger className={cn("w-36 bg-gray-900/50 border-gray-700 text-white h-8 text-xs", dateFilter !== "all" && "border-cyan-500/50")}>
            <Clock className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_FILTERS.map(df => (
              <SelectItem key={df.key} value={df.key}>{df.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Completed window */}
        <Select value={completedWindow} onValueChange={onCompletedWindowChange}>
          <SelectTrigger className="w-32 bg-gray-900/50 border-gray-700 text-white h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPLETED_WINDOWS.map(cw => (
              <SelectItem key={cw.key} value={cw.key}>{cw.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row 2: Entity filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Project */}
        <Select value={filters.projectId || "__all__"} onValueChange={v => onFilterChange({ ...filters, projectId: v === "__all__" ? null : v })}>
          <SelectTrigger className={cn("w-44 bg-gray-900/50 border-gray-700 text-white h-8 text-xs", filters.projectId && "border-cyan-500/50")}>
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Projects</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Technician */}
        <Select value={filters.technicianId || "__all__"} onValueChange={v => onFilterChange({ ...filters, technicianId: v === "__all__" ? null : v })}>
          <SelectTrigger className={cn("w-40 bg-gray-900/50 border-gray-700 text-white h-8 text-xs", filters.technicianId && "border-cyan-500/50")}>
            <SelectValue placeholder="All Technicians" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Technicians</SelectItem>
            {activeTeam.map(tm => (
              <SelectItem key={tm.id} value={tm.id}>{tm.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Toggle filters */}
        <button
          onClick={() => onFilterChange({ ...filters, unassigned: !filters.unassigned })}
          className={cn("px-2 py-1 rounded text-[11px] border transition-colors", filters.unassigned ? "bg-yellow-600/20 border-yellow-500/50 text-yellow-400" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600")}
        >
          Unassigned
        </button>
        <button
          onClick={() => onFilterChange({ ...filters, hasBlockers: !filters.hasBlockers })}
          className={cn("px-2 py-1 rounded text-[11px] border transition-colors", filters.hasBlockers ? "bg-red-600/20 border-red-500/50 text-red-400" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600")}
        >
          Has Blockers
        </button>
        <button
          onClick={() => onFilterChange({ ...filters, blocksDownstream: !filters.blocksDownstream })}
          className={cn("px-2 py-1 rounded text-[11px] border transition-colors", filters.blocksDownstream ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-400" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600")}
        >
          Blocks Others
        </button>
        <button
          onClick={() => onFilterChange({ ...filters, hasPriority: !filters.hasPriority })}
          className={cn("px-2 py-1 rounded text-[11px] border transition-colors", filters.hasPriority ? "bg-red-600/20 border-red-500/50 text-red-400" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600")}
        >
          Priority Only
        </button>

        {/* Clear */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 text-xs gap-1 ml-auto">
            <X className="w-3 h-3" />
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>
    </div>
  );
}