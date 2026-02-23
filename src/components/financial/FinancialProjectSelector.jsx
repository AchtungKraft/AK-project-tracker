import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { useFinancialProjectsView, groupProjectsByType } from "./useFinancialProjectsView";

/**
 * PHASE 3 — Project Selector with Grouping
 * 
 * Shows only projects with parts assigned.
 * Grouped by Project Type.
 * Shows remaining to bill and credit balance.
 */
export default function FinancialProjectSelector({
  value,
  onValueChange,
  placeholder = "Select a project...",
  className,
}) {
  const { data, isLoading, error } = useFinancialProjectsView();

  const groupedProjects = groupProjectsByType(data?.projects || []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 border border-gray-700 rounded-md bg-gray-900/50">
        <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        <span className="text-gray-500 text-sm">Loading projects...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center h-10 px-3 border border-red-700 rounded-md bg-red-900/20">
        <span className="text-red-400 text-sm">Failed to load projects</span>
      </div>
    );
  }

  if (groupedProjects.length === 0) {
    return (
      <div className="flex items-center h-10 px-3 border border-amber-700 rounded-md bg-amber-900/20">
        <span className="text-amber-400 text-sm">No projects with parts assigned</span>
      </div>
    );
  }

  // Find currently selected project for display
  const selectedProject = data?.projects?.find((p) => p.project_id === value);

  // HARD FIX: Prevent selector from writing empty string
  const handleValueChange = (val) => {
    if (!val) return; // Never pass empty string to parent
    onValueChange(val);
  };

  return (
    <Select value={value ?? undefined} onValueChange={handleValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {selectedProject && (
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: selectedProject.project_type_color }}
              />
              <span className="truncate">{selectedProject.project_name}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {groupedProjects.map((group) => (
          <SelectGroup key={group.type_name}>
            <SelectLabel className="flex items-center gap-2 text-gray-400">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: group.type_color }}
              />
              {group.type_name}
              <Badge variant="secondary" className="ml-auto text-xs">
                {group.projects.length}
              </Badge>
            </SelectLabel>
            {group.projects.map((project) => (
              <SelectItem
                key={project.project_id}
                value={project.project_id}
                className="pl-6"
              >
                <div className="flex items-center justify-between w-full gap-3">
                  <span className="truncate">{project.project_name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {project.remaining_to_bill > 0 && (
                      <Badge className="bg-blue-600/20 text-blue-400 text-xs">
                        {formatCurrencyUSD(project.remaining_to_bill)} due
                      </Badge>
                    )}
                    {project.available_credit > 0 && (
                      <Badge className="bg-green-600/20 text-green-400 text-xs">
                        {formatCurrencyUSD(project.available_credit)} credit
                      </Badge>
                    )}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}