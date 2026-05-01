import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search, Clock } from "lucide-react";
import { getLastUsedProjects, recordProjectUsage } from "@/components/shared/useLastUsedProjects";

/**
 * GroupedProjectSelector — Searchable project list grouped by ProjectType.
 * Now includes "Last Used" section at top.
 *
 * Props:
 *  - selectedProjectId: string
 *  - onSelect: (projectId: string) => void
 *  - searchTerm: string
 *  - onSearchChange: (term: string) => void
 */

const GROUP_SORT_ORDER = [
  "client",
  "performance",
  "development",
  "internal",
];

export default function GroupedProjectSelector({ selectedProjectId, onSelect, searchTerm, onSearchChange }) {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ["projectTypes"],
    queryFn: () => base44.entities.ProjectType.list("sort_order", 100),
  });

  const typesMap = useMemo(() => new Map(projectTypes.map(t => [t.id, t])), [projectTypes]);

  // Last used
  const lastUsed = useMemo(() => getLastUsedProjects(), [selectedProjectId]);
  const lastUsedIds = useMemo(() => new Set(lastUsed.map(e => e.id)), [lastUsed]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchTerm) return projects;
    const term = searchTerm.toLowerCase();
    return projects.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.client_name?.toLowerCase().includes(term)
    );
  }, [projects, searchTerm]);

  const lastUsedProjects = useMemo(() => {
    if (searchTerm) return []; // hide when searching
    return lastUsed.map(e => projects.find(p => p.id === e.id)).filter(Boolean);
  }, [lastUsed, projects, searchTerm]);

  // Group projects by type (excluding last-used to avoid duplicates)
  const grouped = useMemo(() => {
    const groups = new Map();
    const ungrouped = [];

    for (const p of filtered) {
      if (!searchTerm && lastUsedIds.has(p.id)) continue;
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
        if (sortKey === -1) sortKey = GROUP_SORT_ORDER.length + (typeRec?.sort_order || 99);
        groups.set(typeId, { typeName, sortKey, color: typeRec?.color, projects: [] });
      }
      groups.get(typeId).projects.push(p);
    }

    const result = [...groups.values()].sort((a, b) => a.sortKey - b.sortKey);

    if (ungrouped.length > 0) {
      result.push({ typeName: "Uncategorized", sortKey: 999, color: null, projects: ungrouped });
    }

    return result;
  }, [filtered, typesMap, lastUsedIds, searchTerm]);

  const totalCount = filtered.length;

  const handleSelect = (projectId) => {
    recordProjectUsage(projectId);
    onSelect(projectId);
  };

  const renderRow = (p) => (
    <button
      key={p.id}
      onClick={() => handleSelect(p.id)}
      className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-gray-800/50 last:border-b-0 ${
        selectedProjectId === p.id
          ? "bg-blue-900/40 text-white"
          : "text-gray-300 hover:bg-gray-800"
      }`}
    >
      <span className="font-medium">{p.name}</span>
      {p.client_name && (
        <span className="text-gray-500 ml-2 text-xs">— {p.client_name}</span>
      )}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          placeholder="Search projects..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-10 bg-gray-800 border-gray-600 text-white"
        />
      </div>
      <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-md bg-gray-900/50">
        {totalCount === 0 && lastUsedProjects.length === 0 ? (
          <p className="text-xs text-gray-500 p-3 text-center">No projects found</p>
        ) : (
          <>
            {/* Last Used Section */}
            {lastUsedProjects.length > 0 && (
              <div>
                <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-800 border-b border-gray-700 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Last Used</span>
                </div>
                {lastUsedProjects.map(renderRow)}
              </div>
            )}

            {/* Grouped */}
            {grouped.map(group => (
              <div key={group.typeName}>
                <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                  {group.color && (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                  )}
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {group.typeName}
                  </span>
                  <span className="text-[10px] text-gray-600">{group.projects.length}</span>
                </div>
                {group.projects.map(renderRow)}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}