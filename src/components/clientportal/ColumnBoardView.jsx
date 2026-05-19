import React, { useMemo, useState } from "react";
import { 
  Flame, 
  Zap, 
  Archive,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import MomentumFeed from "./MomentumFeed";
import UnifiedProjectContainer from "./UnifiedProjectContainer";

const STALE_THRESHOLD_DAYS = 3;

/**
 * Build unified project objects from filteredProjectData.
 */
function buildUnifiedProjects(filteredProjectData) {
  const projects = [];
  const allRequests = [];

  for (const group of filteredProjectData) {
    const project = group.project;
    const pName = project?.name || 'Unknown Project';
    const pId = project?.id || 'unknown';
    
    const bucketKeys = ['draft', 'awaiting_client', 'client_replied', 'recently_approved', 'approved'];
    const projectRequests = [];
    
    for (const bk of bucketKeys) {
      for (const r of (group[bk] || [])) {
        const enriched = { ...r, _projectName: pName, _projectId: pId, _bucket: bk };
        projectRequests.push(enriched);
        allRequests.push(enriched);
      }
    }

    if (projectRequests.length === 0) continue;

    let overdue = 0, waiting = 0, replied = 0, recentApproval = 0, approvedArchive = 0, drafts = 0;
    let latestTs = null;

    for (const r of projectRequests) {
      const ts = r.latestActivityAt || r.updated_date;
      if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) latestTs = ts;
      if (r._bucket === 'recently_approved') { recentApproval++; continue; }
      if (r._bucket === 'approved') { approvedArchive++; continue; }
      if (r._bucket === 'draft') { drafts++; continue; }
      if (r.isOverdue) overdue++;
      if (r._bucket === 'client_replied') replied++;
      else if (r._bucket === 'awaiting_client' && !r.isOverdue) waiting++;
    }

    const active = overdue + waiting + replied + drafts;
    const daysSinceActivity = latestTs 
      ? (Date.now() - new Date(latestTs).getTime()) / (1000 * 60 * 60 * 24) 
      : 999;
    const isStalled = daysSinceActivity >= STALE_THRESHOLD_DAYS && active > 0;

    const accent = { border: 'border-l-amber-500/60', headerBg: 'bg-amber-950/10', text: 'text-amber-400' };
    if (overdue > 0) Object.assign(accent, { border: 'border-l-red-500', headerBg: 'bg-red-950/15', text: 'text-red-400' });
    else if (replied > 0) Object.assign(accent, { border: 'border-l-blue-500', headerBg: 'bg-blue-950/10', text: 'text-blue-400' });
    else if (isStalled) Object.assign(accent, { border: 'border-l-orange-500', headerBg: 'bg-orange-950/10', text: 'text-orange-400' });
    else if (active === 0 && recentApproval > 0) Object.assign(accent, { border: 'border-l-emerald-500/60', headerBg: 'bg-emerald-950/10', text: 'text-emerald-400' });
    else if (active === 0 && approvedArchive > 0) Object.assign(accent, { border: 'border-l-gray-600/40', headerBg: 'bg-gray-900/20', text: 'text-gray-500' });

    const health = { overdue, waiting, replied, recentApproval, approvedArchive, drafts, active, latestTs, isStalled, daysSinceActivity, accent };
    projects.push({ project, health, allRequests: projectRequests });
  }

  return { projects, allRequests };
}

/**
 * Triage projects into priority lanes.
 */
function triageProjects(projects) {
  const immediate = [];
  const active = [];
  const background = [];

  for (const p of projects) {
    const h = p.health;
    if (h.overdue > 0 || h.replied > 0 || (h.isStalled && h.active > 0)) immediate.push(p);
    else if (h.active > 0 || h.recentApproval > 0) active.push(p);
    else background.push(p);
  }

  immediate.sort((a, b) => {
    if (a.health.overdue !== b.health.overdue) return b.health.overdue - a.health.overdue;
    if (a.health.replied !== b.health.replied) return b.health.replied - a.health.replied;
    return a.health.daysSinceActivity - b.health.daysSinceActivity;
  });

  active.sort((a, b) => {
    const aTs = a.health.latestTs ? new Date(a.health.latestTs).getTime() : 0;
    const bTs = b.health.latestTs ? new Date(b.health.latestTs).getTime() : 0;
    return bTs - aTs;
  });

  background.sort((a, b) => {
    const aTs = a.health.latestTs ? new Date(a.health.latestTs).getTime() : 0;
    const bTs = b.health.latestTs ? new Date(b.health.latestTs).getTime() : 0;
    return bTs - aTs;
  });

  return { immediate, active, background };
}

/**
 * Lane — minimal section divider with lean project stream.
 * No wrapping card. Just a label + project list.
 */
function ProjectLane({
  label, icon: Icon, color, projects: laneProjects,
  getProjectClientSlug, onUpdateDueDate, defaultExpanded = true,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (laneProjects.length === 0) return null;

  const totalOverdue = laneProjects.reduce((s, p) => s + p.health.overdue, 0);

  return (
    <div>
      {/* Lane header — minimal divider line */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 px-2 py-1.5 group"
      >
        <div className="text-gray-600 shrink-0">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
        <Icon className={cn("w-3.5 h-3.5 shrink-0", color)} />
        <span className={cn("text-[11px] font-semibold uppercase tracking-widest", color)}>
          {label}
        </span>
        {totalOverdue > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-semibold">
            <AlertCircle className="w-2.5 h-2.5" />{totalOverdue}
          </span>
        )}
        <span className="text-[10px] text-gray-700 tabular-nums">{laneProjects.length}</span>
        <div className="flex-1 border-t border-gray-800/50 ml-2" />
      </button>

      {/* Project stream */}
      {expanded && (
        <div className="space-y-0">
          {laneProjects.map(p => (
            <UnifiedProjectContainer
              key={p.project?.id || 'unknown'}
              project={p.project}
              health={p.health}
              allRequests={p.allRequests}
              getProjectClientSlug={getProjectClientSlug}
              onUpdateDueDate={onUpdateDueDate}
              defaultExpanded={p.allRequests.length <= 3}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ColumnBoardView — editorial operational queue.
 * 
 * No nested cards. No heavy borders.
 * Flat project stream triaged by priority lanes.
 */
export default function ColumnBoardView({
  filteredProjectData,
  projects,
  getProjectClientSlug,
  onUpdateDueDate,
  lifecycleQuickFilter,
}) {
  const { projects: unifiedProjects, allRequests } = useMemo(
    () => buildUnifiedProjects(filteredProjectData),
    [filteredProjectData]
  );

  const lanes = useMemo(
    () => triageProjects(unifiedProjects),
    [unifiedProjects]
  );

  if (allRequests.length === 0) return null;

  return (
    <div className="space-y-1">
      {/* Momentum ticker */}
      <MomentumFeed allRequests={allRequests} />

      {/* Immediate Attention */}
      <ProjectLane
        label="Immediate"
        icon={Flame}
        color="text-red-400"
        projects={lanes.immediate}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={true}
      />

      {/* Active Momentum */}
      <ProjectLane
        label="Active"
        icon={Zap}
        color="text-amber-400"
        projects={lanes.active}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={true}
      />

      {/* Background / Approved */}
      <ProjectLane
        label="Resolved"
        icon={Archive}
        color="text-gray-500"
        projects={lanes.background}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={false}
      />
    </div>
  );
}