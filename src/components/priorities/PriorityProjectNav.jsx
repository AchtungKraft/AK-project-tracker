import React, { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Search,
  X,
  User,
  AlertTriangle,
  Clock,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupProjectsByType } from "@/utils/projectTypeGroups";
import { isUrgentPriority } from "@/utils/taskPrioritySort";

// ── Quick filter definitions ──
const QUICK_FILTERS = [
  { key: "all", label: "All", icon: null },
  { key: "mine", label: "Mine", icon: User },
  { key: "urgent", label: "Urgent", icon: AlertTriangle },
  { key: "due_soon", label: "Due Soon", icon: Clock },
  { key: "overdue", label: "Overdue", icon: Hourglass },
];

// ── Batch-generate unique compact labels for all projects ──
// Returns Map<projectId, label>. Sees all projects to detect & resolve collisions.
function buildLabelMap(projects) {
  const map = new Map();

  // Step 1: generate candidate label for each project
  const candidates = projects.map((p) => ({
    id: p.id,
    label: candidateLabel(p),
    project: p,
  }));

  // Step 2: detect duplicates (case-insensitive) and disambiguate
  const labelCountCI = {};
  candidates.forEach((c) => {
    const key = c.label.toLowerCase();
    labelCountCI[key] = (labelCountCI[key] || 0) + 1;
  });

  candidates.forEach((c) => {
    let label = c.label;
    if (labelCountCI[label.toLowerCase()] > 1) {
      label = disambiguate(c.project, label);
    }
    map.set(c.id, label);
  });

  // Step 3: verify uniqueness (case-insensitive) — if still colliding, append project code or index
  const finalCountCI = {};
  map.forEach((label, id) => {
    const key = label.toLowerCase();
    if (!finalCountCI[key]) finalCountCI[key] = [];
    finalCountCI[key].push(id);
  });
  Object.values(finalCountCI).forEach((ids) => {
    if (ids.length > 1) {
      ids.forEach((id, i) => {
        const p = projects.find((pr) => pr.id === id);
        const code = extractCode(p?.name);
        if (code) {
          map.set(id, code + " · " + map.get(id));
        } else {
          map.set(id, map.get(id) + " (" + (i + 1) + ")");
        }
      });
    }
  });

  return map;
}

// Extract project code (e.g., "26_9106" from "26_9106 Paul Odem")
function extractCode(name) {
  const m = (name || "").match(/^(\d+[_\-]\d+(?:[_\-]\d+)?)/);
  return m ? m[1] : null;
}

// Extract client short name (last name, or short company name)
function clientShort(project) {
  const client = (project.client_name || "").trim();
  if (!client) return null;
  // Single-word names or company names — use as-is if short
  const parts = client.split(/\s+/);
  if (parts.length === 1) return client.length <= 14 ? client : client.slice(0, 12) + "…";
  // Multi-word: use last name
  return parts[parts.length - 1];
}

// Extract descriptor — the vehicle/project detail portion
function extractDescriptor(project) {
  const name = (project.name || "").trim();

  // 1. Separator-based: "Client // Vehicle" or "Client / Detail"
  // Collect ALL segments split by // or /
  const segments = name.split(/\s*(?:\/\/|\/)\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 2) {
    // Find the best descriptor: prefer a segment that is NOT the client name and NOT a project code
    const client = (project.client_name || "").trim().toLowerCase();
    // Also build variants to skip: full name, last name, name without prefix (Dr., Mr., etc.)
    const clientVariants = new Set([client]);
    const clientParts = client.split(/\s+/);
    if (clientParts.length > 1) {
      clientVariants.add(clientParts[clientParts.length - 1]); // last name
      // Strip honorifics: "Dr. Alexander Salerno" → "Alexander Salerno"
      const stripped = client.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "");
      if (stripped !== client) clientVariants.add(stripped);
    }
    for (const seg of segments) {
      const segLower = seg.toLowerCase();
      if (clientVariants.has(segLower)) continue;
      if (/^\d+[_\-]\d+/.test(seg)) continue;
      return seg;
    }
  }

  // 2. Strip project code, then strip client name — remainder is descriptor
  let stripped = name.replace(/^\d+[_\-]\d+(?:[_\-]\d+)?\s*/, "").trim();
  stripped = stripped.replace(/^[_\-]+/, "").trim();

  if (project.client_name) {
    const clientRe = new RegExp(project.client_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const afterClient = stripped.replace(clientRe, "").replace(/^[\s\-–—·:\/]+/, "").replace(/[\s\-–—·:\/]+$/, "").trim();
    if (afterClient && afterClient.length > 1) return afterClient;
  }

  return null;
}

// Generate candidate label for a single project
function candidateLabel(project) {
  const name = (project.name || "").trim();
  if (!name) return "Untitled";

  const client = clientShort(project);
  const descriptor = extractDescriptor(project);
  const code = extractCode(name);

  // Best case: Client · Descriptor
  if (client && descriptor) {
    const desc = descriptor.length > 18 ? descriptor.slice(0, 16) + "…" : descriptor;
    return client + " · " + desc;
  }

  // If we have a code and a client, use Code · Client
  if (code && client) {
    return code + " · " + client;
  }

  // Client-only names (e.g., "Sean Oppen", "Adam Cole")
  if (client && !descriptor && !code) {
    // Use full client name if short, otherwise last name
    const fullClient = (project.client_name || "").trim();
    if (fullClient.length <= 20) return fullClient;
    return client;
  }

  // No client — use name stripped of code
  const stripped = name.replace(/^\d+[_\-]\d+(?:[_\-]\d+)?\s*/, "").replace(/^[_\-]+/, "").trim();
  if (stripped.length <= 24) return stripped;
  return stripped.slice(0, 22) + "…";
}

// Disambiguate a colliding label with more context
function disambiguate(project, currentLabel) {
  const code = extractCode(project.name);
  const fullClient = (project.client_name || "").trim();

  // Try adding project code
  if (code && !currentLabel.includes(code)) {
    return code + " · " + currentLabel;
  }

  // Try using full client name instead of last name
  if (fullClient && !currentLabel.includes(fullClient)) {
    const descriptor = extractDescriptor(project);
    if (descriptor) {
      const desc = descriptor.length > 14 ? descriptor.slice(0, 12) + "…" : descriptor;
      return fullClient.split(/\s+/).slice(0, 2).join(" ") + " · " + desc;
    }
    return fullClient;
  }

  return currentLabel;
}

// ── Build rich tooltip for project row ──
function buildTooltip(project) {
  const lines = [project.name];
  if (project.client_name) lines.push("Client: " + project.client_name);
  // Extract project code if present (e.g., "26_9106")
  const codeMatch = (project.name || "").match(/^(\d+[_\-]\d+)/);
  if (codeMatch) lines.push("Code: " + codeMatch[1]);
  return lines.join("\n");
}

// ── Project row in the nav ──
const ProjectRow = React.memo(function ProjectRow({
  project,
  label,
  taskCount,
  isSelected,
  onToggle,
}) {
  const tooltip = buildTooltip(project);
  return (
    <button
      onClick={() => onToggle(project.id)}
      title={tooltip}
      className={cn(
        "w-full flex items-center gap-1.5 px-1.5 py-[3px] rounded text-left text-[11px] leading-tight transition-colors group",
        isSelected
          ? "bg-red-600/20 text-white"
          : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
      )}
    >
      <div
        className={cn(
          "w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center transition-colors",
          isSelected
            ? "bg-red-600 border-red-600"
            : "border-gray-600 group-hover:border-gray-400"
        )}
      >
        {isSelected && (
          <svg viewBox="0 0 12 12" className="w-2 h-2 text-white fill-current">
            <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="truncate flex-1 min-w-0">{label}</span>
      <span className="text-[10px] text-gray-500 tabular-nums shrink-0 w-5 text-right">
        {taskCount > 0 ? taskCount : ""}
      </span>
    </button>
  );
});

// ── Type group (collapsible) ──
const TypeGroup = React.memo(function TypeGroup({
  typeId,
  typeName,
  typeColor,
  projects,
  selectedProjectIds,
  taskCountByProject,
  labelMap,
  onToggleProject,
  onToggleType,
  isExpanded,
  onToggleExpand,
}) {
  const allSelected = projects.length > 0 && projects.every((p) => selectedProjectIds.has(p.id));
  const someSelected = projects.some((p) => selectedProjectIds.has(p.id));
  const typeTaskCount = projects.reduce((sum, p) => sum + (taskCountByProject[p.id] || 0), 0);

  return (
    <div className="mb-px">
      {/* Type header */}
      <div className="flex items-center gap-0.5 group">
        <button
          onClick={onToggleExpand}
          className="p-px text-gray-500 hover:text-white transition-colors shrink-0"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
        <button
          onClick={() => onToggleType(typeId)}
          className="flex items-center gap-1.5 flex-1 min-w-0 py-px rounded hover:bg-gray-800/40 transition-colors px-1"
        >
          <div
            className={cn(
              "w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center transition-colors",
              allSelected
                ? "border-current bg-current"
                : someSelected
                ? "border-current"
                : "border-gray-600 group-hover:border-gray-400"
            )}
            style={
              allSelected || someSelected ? { borderColor: typeColor, backgroundColor: allSelected ? typeColor : 'transparent' } : undefined
            }
          >
            {allSelected && (
              <svg viewBox="0 0 12 12" className="w-2 h-2 text-white fill-current">
                <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {someSelected && !allSelected && (
              <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: typeColor }} />
            )}
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-widest truncate"
            style={{ color: typeColor }}
          >
            {typeName}
          </span>
          <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
            ({projects.length})
          </span>
        </button>
        <span className="text-[10px] text-gray-600 tabular-nums shrink-0 w-5 text-right pr-0.5">
          {typeTaskCount > 0 ? typeTaskCount : ""}
        </span>
      </div>

      {/* Project list */}
      {isExpanded && (
        <div className="ml-3.5">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              label={labelMap.get(project.id) || project.name}
              taskCount={taskCountByProject[project.id] || 0}
              isSelected={selectedProjectIds.has(project.id)}
              onToggle={onToggleProject}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default function PriorityProjectNav({
  projects,
  projectTypes,
  tasks, // all visible tasks (after status/assignee filters, before project filter)
  currentUserId,
  teamMembers,
  selectedProjectIds,
  onSelectedProjectIdsChange,
  quickFilter,
  onQuickFilterChange,
  onInteraction, // optional — called after project/type/quick-filter selection (used to close mobile drawer)
}) {
  const [search, setSearch] = useState("");
  const [expandedTypes, setExpandedTypes] = useState(() => {
    // Expand all types by default
    const map = {};
    projectTypes.forEach((pt) => { map[pt.id] = true; });
    map["__no_type__"] = true;
    return map;
  });

  // Compute task counts per project (from the pre-filtered task list)
  const taskCountByProject = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const pid = t.project_id;
      if (pid) map[pid] = (map[pid] || 0) + 1;
    });
    return map;
  }, [tasks]);

  // Quick filter counts (computed from the full visible task list)
  const quickFilterCounts = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 7);

    // Find current user's team member ID
    const currentTeamMember = teamMembers.find(
      (tm) => tm.user_id === currentUserId
    );
    const myTmId = currentTeamMember?.id;

    let mine = 0,
      urgent = 0,
      overdue = 0,
      dueSoon = 0;

    tasks.forEach((t) => {
      if (myTmId && t.assigned_team_member_id === myTmId) mine++;
      if (isUrgentPriority(t)) urgent++;
      if (t.due_date) {
        const due = new Date(t.due_date);
        if (due < now) overdue++;
        else if (due <= soon) dueSoon++;
      }
    });

    return { all: tasks.length, mine, urgent, overdue, due_soon: dueSoon };
  }, [tasks, currentUserId, teamMembers]);

  // Projects that have tasks (only show projects with tasks)
  const projectsWithTasks = useMemo(() => {
    const pids = new Set(tasks.map((t) => t.project_id).filter(Boolean));
    return projects.filter((p) => pids.has(p.id));
  }, [projects, tasks]);

  // Build unique compact labels for all visible projects
  const labelMap = useMemo(
    () => buildLabelMap(projectsWithTasks),
    [projectsWithTasks]
  );

  // Group projects by type
  const typeGroups = useMemo(
    () => groupProjectsByType(projectsWithTasks, projectTypes),
    [projectsWithTasks, projectTypes]
  );

  // Search filtering — matches full name, client name, compact label, and project code
  const filteredTypeGroups = useMemo(() => {
    if (!search.trim()) return typeGroups;
    const q = search.toLowerCase();
    return typeGroups
      .map((g) => ({
        ...g,
        projects: g.projects.filter((p) => {
          const label = (labelMap.get(p.id) || "").toLowerCase();
          const code = (extractCode(p.name) || "").toLowerCase();
          return (p.name || "").toLowerCase().includes(q) ||
            (p.client_name || "").toLowerCase().includes(q) ||
            label.includes(q) ||
            code.includes(q);
        }),
      }))
      .filter((g) => g.projects.length > 0);
  }, [typeGroups, search, labelMap]);

  // Selected project IDs as a Set for fast lookups
  const selectedSet = useMemo(
    () => new Set(selectedProjectIds),
    [selectedProjectIds]
  );

  const handleToggleProject = useCallback(
    (projectId) => {
      const next = new Set(selectedProjectIds);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      onSelectedProjectIdsChange(Array.from(next));
      onInteraction?.();
    },
    [selectedProjectIds, onSelectedProjectIdsChange, onInteraction]
  );

  const handleToggleType = useCallback(
    (typeId) => {
      const group = typeGroups.find((g) => g.typeId === typeId);
      if (!group) return;
      const groupProjectIds = group.projects.map((p) => p.id);
      const allSelected = groupProjectIds.every((id) =>
        selectedProjectIds.includes(id)
      );

      let next;
      if (allSelected) {
        next = selectedProjectIds.filter(
          (id) => !groupProjectIds.includes(id)
        );
      } else {
        const existing = new Set(selectedProjectIds);
        groupProjectIds.forEach((id) => existing.add(id));
        next = Array.from(existing);
      }
      onSelectedProjectIdsChange(next);
      onInteraction?.();
    },
    [typeGroups, selectedProjectIds, onSelectedProjectIdsChange, onInteraction]
  );

  const handleToggleExpand = useCallback((typeId) => {
    setExpandedTypes((prev) => ({ ...prev, [typeId]: !prev[typeId] }));
  }, []);

  const handleClearSelection = useCallback(() => {
    onSelectedProjectIdsChange([]);
  }, [onSelectedProjectIdsChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Quick Filters */}
      <div className="px-2 pt-2 pb-1.5 border-b border-gray-800">
        <div className="flex flex-wrap gap-0.5">
          {QUICK_FILTERS.map((qf) => {
            const Icon = qf.icon;
            const count = quickFilterCounts[qf.key] ?? 0;
            const isActive = quickFilter === qf.key;
            return (
              <button
                key={qf.key}
                onClick={() => { onQuickFilterChange(qf.key); onInteraction?.(); }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                  isActive
                    ? "bg-red-600/30 text-red-400 border border-red-500/50"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/60 border border-transparent"
                )}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {qf.label}
                {qf.key !== "all" && count > 0 && (
                  <span className="text-[10px] opacity-70">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="h-6 pl-6 pr-6 text-[11px] bg-gray-900/50 border-gray-700 text-white placeholder:text-gray-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Selection indicator */}
      {selectedProjectIds.length > 0 && (
        <div className="px-2 pb-1 flex items-center justify-between">
          <span className="text-[10px] text-red-400 font-medium">
            {selectedProjectIds.length} selected
          </span>
          <button
            onClick={handleClearSelection}
            className="text-[10px] text-gray-500 hover:text-white flex items-center gap-0.5"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        </div>
      )}

      {/* Project tree */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-hide">
        {filteredTypeGroups.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">
            {search ? "No matching projects" : "No projects with tasks"}
          </p>
        ) : (
          filteredTypeGroups.map((group) => (
            <TypeGroup
              key={group.typeId}
              typeId={group.typeId}
              typeName={group.typeName}
              typeColor={group.typeColor}
              projects={group.projects}
              selectedProjectIds={selectedSet}
              taskCountByProject={taskCountByProject}
              labelMap={labelMap}
              onToggleProject={handleToggleProject}
              onToggleType={handleToggleType}
              isExpanded={expandedTypes[group.typeId] !== false}
              onToggleExpand={() => handleToggleExpand(group.typeId)}
            />
          ))
        )}
      </div>
    </div>
  );
}