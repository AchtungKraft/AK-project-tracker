import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "all", label: "All Types" },
  { value: "procedure", label: "Procedures" },
  { value: "guide", label: "Guides" },
  { value: "issue", label: "Known Issues" },
  { value: "reference", label: "References" },
  { value: "checklist", label: "Checklists" },
  { value: "tip", label: "Tips" },
  { value: "document", label: "Documents" },
];

export default function KnowledgeViewToolbar({ typeFilter, onTypeFilterChange, showGrouping, onToggleGrouping, itemsCount }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700 text-white h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        onClick={onToggleGrouping}
        className={cn("h-8 border-gray-700 gap-1.5 text-xs", showGrouping ? "text-red-400 border-red-900/50" : "text-gray-400")}
      >
        <Layers className="w-3.5 h-3.5" />
        Group
      </Button>

      <span className="text-xs text-gray-500 ml-auto">
        {itemsCount} item{itemsCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}