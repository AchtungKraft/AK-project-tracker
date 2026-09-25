import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2,
  Search,
  Users,
  FolderKanban,
  AlertTriangle,
  UserX,
  Edit2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

// ── Integrity helpers ──
function computeIntegrityIssues(projects, teamMemberMap) {
  const issues = { safe: [], review: [] };
  projects.forEach((p) => {
    const team = p.assigned_team || [];
    // Duplicates
    const seen = new Set();
    const dupes = [];
    team.forEach((id) => {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    });
    if (dupes.length > 0) {
      issues.safe.push({
        type: "duplicate",
        projectId: p.id,
        projectName: p.name,
        ids: dupes,
        message: `Duplicate assignment(s) in "${p.name}"`,
      });
    }
    // Orphaned IDs
    team.forEach((id) => {
      if (!teamMemberMap.has(id)) {
        issues.review.push({
          type: "orphan",
          projectId: p.id,
          projectName: p.name,
          id,
          message: `"${p.name}" references deleted team member ${id.slice(-6)}`,
        });
      }
    });
  });
  return issues;
}

// ── Edit Drawer ──
function AssignmentEditDrawer({ project, teamMembers, statuses, onClose }) {
  const queryClient = useQueryClient();
  const activeMembers = teamMembers.filter((tm) => tm.active);
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(project.assigned_team || [])
  );

  const mutation = useMutation({
    mutationFn: (newTeam) =>
      base44.entities.Project.update(project.id, { assigned_team: newTeam }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["projectAssignmentsAdmin"] });
      toast({ title: "Assignments updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const toggle = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const status = statuses.find((s) => s.id === project.status_id);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="bg-gray-900 border-l border-red-900/30 text-white w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-white text-lg">{project.name}</SheetTitle>
          {status && (
            <Badge
              style={{ backgroundColor: status.color }}
              className="text-white text-xs w-fit"
            >
              {status.label}
            </Badge>
          )}
        </SheetHeader>

        <div className="space-y-1">
          {activeMembers.map((tm) => (
            <label
              key={tm.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/60 cursor-pointer transition-colors"
            >
              <Checkbox
                checked={selectedIds.has(tm.id)}
                onCheckedChange={() => toggle(tm.id)}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{tm.full_name}</span>
                {tm.team_role && (
                  <span className="text-xs text-gray-400 ml-2">
                    ({tm.team_role})
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-2 mt-6 pt-4 border-t border-gray-800">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate([...selectedIds])}
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Project Row ──
function ProjectRow({ project, teamMemberMap, statuses, projectTypes, onEdit }) {
  const team = (project.assigned_team || [])
    .map((id) => teamMemberMap.get(id))
    .filter(Boolean);
  const orphaned = (project.assigned_team || []).filter(
    (id) => !teamMemberMap.has(id)
  );
  const status = statuses.find((s) => s.id === project.status_id);
  const pType = projectTypes.find((t) => t.id === project.project_type_id);

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-gray-800/40 rounded-lg transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-white font-medium truncate max-w-[260px]">
            {project.name}
          </span>
          {pType && (
            <span className="text-[10px] text-gray-500 uppercase">
              {pType.name}
            </span>
          )}
          {status && (
            <Badge
              style={{ backgroundColor: status.color }}
              className="text-white text-[10px] px-1.5 py-0"
            >
              {status.label}
            </Badge>
          )}
          {project.is_system_project && (
            <Badge className="bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0">
              SYSTEM
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {team.length === 0 && orphaned.length === 0 && (
            <span className="text-xs text-gray-500 italic">No one assigned</span>
          )}
          {team.map((tm) => (
            <Badge
              key={tm.id}
              className="bg-gray-700 text-gray-200 text-[10px] px-1.5 py-0"
            >
              {tm.full_name}
            </Badge>
          ))}
          {orphaned.map((id) => (
            <Badge
              key={id}
              className="bg-yellow-900/40 text-yellow-400 border border-yellow-600/40 text-[10px] px-1.5 py-0"
            >
              <UserX className="w-3 h-3 mr-0.5 inline" />
              {id.slice(-6)}
            </Badge>
          ))}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 shrink-0"
        onClick={() => onEdit(project)}
      >
        <Edit2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ── User-Centric Row ──
function UserProjectList({ member, projects, statuses, projectTypes, onEdit }) {
  const [expanded, setExpanded] = useState(true);
  const memberProjects = projects.filter((p) =>
    (p.assigned_team || []).includes(member.id)
  );

  if (memberProjects.length === 0) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-gray-800/40 rounded-md transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
        <span className="text-sm text-white font-medium">{member.full_name}</span>
        {member.team_role && (
          <span className="text-xs text-gray-400">({member.team_role})</span>
        )}
        <Badge className="bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0 ml-auto">
          {memberProjects.length}
        </Badge>
      </button>
      {expanded && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-800 pl-2">
          {memberProjects.map((p) => {
            const status = statuses.find((s) => s.id === p.status_id);
            const pType = projectTypes.find((t) => t.id === p.project_type_id);
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800/40 rounded group cursor-pointer"
                onClick={() => onEdit(p)}
              >
                <span className="text-xs text-gray-300 truncate flex-1">
                  {p.name}
                </span>
                {pType && (
                  <span className="text-[10px] text-gray-500">{pType.name}</span>
                )}
                {status && (
                  <Badge
                    style={{ backgroundColor: status.color }}
                    className="text-white text-[10px] px-1.5 py-0"
                  >
                    {status.label}
                  </Badge>
                )}
                <Edit2 className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main ──
export default function ProjectAssignmentsConfig() {
  const [viewMode, setViewMode] = useState("project"); // project | user
  const [search, setSearch] = useState("");
  const [filterMember, setFilterMember] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [showIntegrity, setShowIntegrity] = useState(false);

  const { data: projects = [], isLoading: loadingP } = useQuery({
    queryKey: ["projectAssignmentsAdmin"],
    queryFn: () => base44.entities.Project.list("-created_date", 500),
  });

  const { data: teamMembers = [], isLoading: loadingTM } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ["projectTypes"],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const isLoading = loadingP || loadingTM;

  const teamMemberMap = useMemo(
    () => new Map(teamMembers.map((tm) => [tm.id, tm])),
    [teamMembers]
  );

  const projectStatuses = useMemo(
    () => statuses.filter((s) => s.scope === "Project"),
    [statuses]
  );

  // Identify "completed/archived" statuses by label heuristic
  const completedStatusIds = useMemo(() => {
    const labels = ["completed", "complete", "archived", "cancelled", "closed", "delivered"];
    return new Set(
      projectStatuses
        .filter((s) => labels.some((l) => s.label?.toLowerCase().includes(l)))
        .map((s) => s.id)
    );
  }, [projectStatuses]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Default: hide completed unless toggled
      if (!showCompleted && completedStatusIds.has(p.status_id)) return false;
      // Search
      if (search) {
        const q = search.toLowerCase();
        if (!p.name?.toLowerCase().includes(q) && !p.client_name?.toLowerCase().includes(q))
          return false;
      }
      // Member filter
      if (filterMember !== "all") {
        if (!(p.assigned_team || []).includes(filterMember)) return false;
      }
      // Type filter
      if (filterType !== "all" && p.project_type_id !== filterType) return false;
      // Status filter
      if (filterStatus !== "all" && p.status_id !== filterStatus) return false;
      return true;
    });
  }, [projects, search, filterMember, filterType, filterStatus, showCompleted, completedStatusIds]);

  const integrity = useMemo(
    () => computeIntegrityIssues(projects, teamMemberMap),
    [projects, teamMemberMap]
  );
  const issueCount = integrity.safe.length + integrity.review.length;

  const activeMembers = teamMembers.filter((tm) => tm.active);

  if (isLoading) {
    return (
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-white text-base">
                Project Assignments
              </CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">
                {filteredProjects.length} projects · {activeMembers.length} active
                members
              </p>
            </div>
            {issueCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowIntegrity((v) => !v)}
                className="border-yellow-600/40 text-yellow-400 hover:bg-yellow-900/20 text-xs gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {issueCount} issue{issueCount !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-3 space-y-3">
          {/* Integrity panel */}
          {showIntegrity && issueCount > 0 && (
            <div className="p-3 bg-yellow-900/10 border border-yellow-600/30 rounded-lg space-y-2">
              <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wide">
                Assignment Integrity
              </p>
              {integrity.safe.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase mb-1">
                    Safe to Normalize
                  </p>
                  {integrity.safe.map((i, idx) => (
                    <p key={idx} className="text-xs text-gray-300">
                      {i.message}
                    </p>
                  ))}
                </div>
              )}
              {integrity.review.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase mb-1">
                    Requires Review
                  </p>
                  {integrity.review.map((i, idx) => (
                    <p key={idx} className="text-xs text-yellow-300">
                      ⚠ {i.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* View toggle + filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-800 rounded-md p-0.5">
              <button
                onClick={() => setViewMode("project")}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition-colors",
                  viewMode === "project"
                    ? "bg-red-600 text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                <FolderKanban className="w-3.5 h-3.5 inline mr-1" />
                Project
              </button>
              <button
                onClick={() => setViewMode("user")}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition-colors",
                  viewMode === "user"
                    ? "bg-red-600 text-white"
                    : "text-gray-400 hover:text-white"
                )}
              >
                <Users className="w-3.5 h-3.5 inline mr-1" />
                User
              </button>
            </div>

            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="pl-7 h-8 text-xs bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <Select value={filterMember} onValueChange={setFilterMember}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Members</SelectItem>
                {activeMembers.map((tm) => (
                  <SelectItem key={tm.id} value={tm.id}>
                    {tm.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-[120px] text-xs bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {projectTypes
                  .filter((t) => t.active)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-[120px] text-xs bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {projectStatuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer shrink-0">
              <Checkbox
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
                className="h-3.5 w-3.5"
              />
              Completed
            </label>
          </div>

          {/* Content */}
          {filteredProjects.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No projects match the current filters.
            </div>
          ) : viewMode === "project" ? (
            <div className="space-y-0.5 max-h-[calc(100vh-22rem)] overflow-y-auto">
              {filteredProjects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  teamMemberMap={teamMemberMap}
                  statuses={projectStatuses}
                  projectTypes={projectTypes}
                  onEdit={setEditingProject}
                />
              ))}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-22rem)] overflow-y-auto">
              {activeMembers.map((tm) => (
                <UserProjectList
                  key={tm.id}
                  member={tm}
                  projects={filteredProjects}
                  statuses={projectStatuses}
                  projectTypes={projectTypes}
                  onEdit={setEditingProject}
                />
              ))}
              {/* Unassigned projects */}
              {(() => {
                const unassigned = filteredProjects.filter(
                  (p) => !(p.assigned_team || []).length
                );
                if (!unassigned.length) return null;
                return (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <UserX className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-sm text-gray-400 font-medium">
                        Unassigned
                      </span>
                      <Badge className="bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0 ml-auto">
                        {unassigned.length}
                      </Badge>
                    </div>
                    <div className="ml-5 space-y-0.5 border-l border-gray-800 pl-2">
                      {unassigned.map((p) => {
                        const status = projectStatuses.find(
                          (s) => s.id === p.status_id
                        );
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800/40 rounded group cursor-pointer"
                            onClick={() => setEditingProject(p)}
                          >
                            <span className="text-xs text-gray-300 truncate flex-1">
                              {p.name}
                            </span>
                            {status && (
                              <Badge
                                style={{ backgroundColor: status.color }}
                                className="text-white text-[10px] px-1.5 py-0"
                              >
                                {status.label}
                              </Badge>
                            )}
                            <Edit2 className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Drawer */}
      {editingProject && (
        <AssignmentEditDrawer
          project={editingProject}
          teamMembers={teamMembers}
          statuses={projectStatuses}
          onClose={() => setEditingProject(null)}
        />
      )}
    </>
  );
}