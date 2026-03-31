import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

/**
 * GroupedProjectSelector — Searchable project list grouped by ProjectType.
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
    queryKey: ["projects-for-service-modal"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ["projectTypes"],
    queryFn: () => base44.entities.ProjectType.list("sort_order", 100),
  });

  const typesMap = useMemo(() => new Map(projectTypes.map(t => [t.id, t])), [projectTypes]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchTerm) return projects;
    const term = searchTerm.toLowerCase();
    return projects.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.client_name?.toLowerCase().includes(term)
    );
  }, [projects, searchTerm]);

  // Group projects by type
  const grouped = useMemo(() => {
    const groups = new Map(); // typeId -> { typeName, sortKey, projects[] }
    const ungrouped = [];

    for (const p of filtered) {
      const typeId = p.project_type_id;
      if (!typeId) {
        ungrouped.push(p);
        continue;
      }
      if (!groups.has(typeId)) {
        const typeRec = typesMap.get(typeId);
        const typeName = typeRec?.name || "Other";
        const nameLC = typeName.toLowerCase();
        // Use explicit sort order if found, otherwise push to end
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
  }, [filtered, typesMap]);

  const totalCount = filtered.length;

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
        {totalCount === 0 ? (
          <p className="text-xs text-gray-500 p-3 text-center">No projects found</p>
        ) : (
          grouped.map(group => (
            <div key={group.typeName}>
              {/* Group Header */}
              <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                {group.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {group.typeName}
                </span>
                <span className="text-[10px] text-gray-600">{group.projects.length}</span>
              </div>
              {/* Project Rows */}
              {group.projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p.id)}
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
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}