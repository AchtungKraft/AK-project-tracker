import React, { useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";
import { getLastUsedProjects, recordProjectUsage } from "./useLastUsedProjects";

const GROUP_SORT_ORDER = ["client", "performance", "development", "internal"];

/**
 * ProjectSelect — Unified project dropdown with "Last Used" and grouped-by-type.
 *
 * Props:
 *  - value: string (project_id)
 *  - onChange: (project_id: string) => void
 *  - includeCompleted: boolean (default false)
 *  - placeholder: string
 *  - className: string
 *  - renderItem: (project, { alreadyUsed }) => ReactNode (optional per-item decorator)
 */
export default function ProjectSelect({
  value,
  onChange,
  includeCompleted = false,
  placeholder = "Select project...",
  className,
  renderItem,
}) {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ["projectTypes"],
    queryFn: () => base44.entities.ProjectType.list("sort_order", 100),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const typesMap = useMemo(
    () => new Map(projectTypes.map((t) => [t.id, t])),
    [projectTypes]
  );

  // Determine completed/cancelled status IDs
  const excludedStatusIds = useMemo(() => {
    if (includeCompleted) return new Set();
    const ids = new Set();
    statuses.forEach((s) => {
      if (s.scope !== "Project") return;
      const lbl = s.label.toLowerCase();
      if (
        lbl.includes("complete") ||
        lbl.includes("done") ||
        lbl.includes("cancelled") ||
        lbl.includes("closed") ||
        lbl.includes("archived")
      ) {
        ids.add(s.id);
      }
    });
    return ids;
  }, [statuses, includeCompleted]);

  const activeProjects = useMemo(
    () =>
      projects.filter(
        (p) => !excludedStatusIds.has(p.status_id)
      ),
    [projects, excludedStatusIds]
  );

  // Last-used section
  const lastUsed = useMemo(() => getLastUsedProjects(), [value]); // re-derive when value changes
  const lastUsedIds = useMemo(() => new Set(lastUsed.map((e) => e.id)), [lastUsed]);

  const lastUsedProjects = useMemo(() => {
    return lastUsed
      .map((e) => activeProjects.find((p) => p.id === e.id))
      .filter(Boolean);
  }, [lastUsed, activeProjects]);

  // Grouped projects (excluding last-used to avoid duplicates)
  const grouped = useMemo(() => {
    const groups = new Map();
    const ungrouped = [];

    for (const p of activeProjects) {
      if (lastUsedIds.has(p.id)) continue; // skip — already in Last Used
      const typeId = p.project_type_id;
      if (!typeId) {
        ungrouped.push(p);
        continue;
      }
      if (!groups.has(typeId)) {
        const typeRec = typesMap.get(typeId);
        const typeName = typeRec?.name || "Other";
        const nameLC = typeName.toLowerCase();
        let sortKey = GROUP_SORT_ORDER.indexOf(nameLC);
        if (sortKey === -1)
          sortKey = GROUP_SORT_ORDER.length + (typeRec?.sort_order || 99);
        groups.set(typeId, {
          typeName,
          sortKey,
          color: typeRec?.color,
          projects: [],
        });
      }
      groups.get(typeId).projects.push(p);
    }

    // Sort projects within each group
    for (const g of groups.values()) {
      g.projects.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    const result = [...groups.values()].sort((a, b) => a.sortKey - b.sortKey);

    if (ungrouped.length > 0) {
      ungrouped.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      result.push({
        typeName: "Uncategorized",
        sortKey: 999,
        color: null,
        projects: ungrouped,
      });
    }

    return result;
  }, [activeProjects, typesMap, lastUsedIds]);

  const handleChange = useCallback(
    (projectId) => {
      if (!projectId) return;
      recordProjectUsage(projectId);
      onChange(projectId);
    },
    [onChange]
  );

  const defaultRenderItem = (project) => project.name;

  return (
    <Select value={value || undefined} onValueChange={handleChange}>
      <SelectTrigger className={className || "bg-gray-800 border-gray-700 text-white"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {activeProjects.length === 0 ? (
          <div className="p-2 text-sm text-gray-400 text-center">
            No active projects
          </div>
        ) : (
          <>
            {/* Last Used Section */}
            {lastUsedProjects.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-gray-500 font-semibold px-2 py-1.5 bg-gray-800/50 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-gray-500" />
                  Last Used
                </SelectLabel>
                {lastUsedProjects.map((p) => (
                  <SelectItem key={`recent-${p.id}`} value={p.id} className="pl-6">
                    {renderItem ? renderItem(p) : defaultRenderItem(p)}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {/* Grouped by Type */}
            {grouped.map((group) => (
              <SelectGroup key={group.typeName}>
                <SelectLabel className="text-xs text-gray-500 font-semibold px-2 py-1.5 bg-gray-800/50 flex items-center gap-1.5">
                  {group.color && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  {group.typeName}
                  <span className="text-[10px] text-gray-600 ml-auto">
                    {group.projects.length}
                  </span>
                </SelectLabel>
                {group.projects.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="pl-6">
                    {renderItem ? renderItem(p) : defaultRenderItem(p)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}