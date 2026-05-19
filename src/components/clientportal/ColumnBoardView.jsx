import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { 
  Flame, 
  Zap, 
  Archive,
  CheckCircle2,
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
 * Each project appears ONCE with ALL requests and computed health.
 */
function buildUnifiedProjects(filteredProjectData) {
  const projects = [];
  const allRequests = [];

  for (const group of filteredProjectData) {
    const project = group.project;
    const pName = project?.name || 'Unknown Project';
    const pId = project?.id || 'unknown';
    
    // Collect ALL requests for this project across all buckets
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

    // === COMPUTE PROJECT HEALTH ===
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

    // Accent color priority
    let accent = { border: 'border-l-amber-500/60', headerBg: 'bg-amber-950/10', text: 'text-amber-400' };
    if (overdue > 0) accent = { border: 'border-l-red-500', headerBg: 'bg-red-950/15', text: 'text-red-400' };
    else if (replied > 0) accent = { border: 'border-l-blue-500', headerBg: 'bg-blue-950/10', text: 'text-blue-400' };
    else if (isStalled) accent = { border: 'border-l-orange-500', headerBg: 'bg-orange-950/10', text: 'text-orange-400' };
    else if (active === 0 && recentApproval > 0) accent = { border: 'border-l-emerald-500/60', headerBg: 'bg-emerald-950/10', text: 'text-emerald-400' };
    else if (active === 0 && approvedArchive > 0) accent = { border: 'border-l-gray-600/40', headerBg: 'bg-gray-900/20', text: 'text-gray-500' };

    const health = {
      overdue, waiting, replied, recentApproval, approvedArchive, drafts,
      active, latestTs, isStalled, daysSinceActivity, accent,
    };

    projects.push({ project, health, allRequests: projectRequests });
  }

  return { projects, allRequests };
}

/**
 * Triage projects into priority lanes based on project-level health.
 * Each project appears in EXACTLY ONE lane.
 */
function triageProjects(projects) {
  const immediate = []; // overdue, client replied, stalled
  const active = [];    // awaiting client, drafts in progress
  const background = []; // only approved/archive

  for (const p of projects) {
    const h = p.health;
    
    if (h.overdue > 0 || h.replied > 0 || (h.isStalled && h.active > 0)) {
      immediate.push(p);
    } else if (h.active > 0 || h.recentApproval > 0) {
      active.push(p);
    } else {
      background.push(p);
    }
  }

  // Sort immediate: most overdue first, then most replied, then stalled
  immediate.sort((a, b) => {
    if (a.health.overdue !== b.health.overdue) return b.health.overdue - a.health.overdue;
    if (a.health.replied !== b.health.replied) return b.health.replied - a.health.replied;
    return a.health.daysSinceActivity - b.health.daysSinceActivity;
  });

  // Sort active: most recently active first
  active.sort((a, b) => {
    const aTs = a.health.latestTs ? new Date(a.health.latestTs).getTime() : 0;
    const bTs = b.health.latestTs ? new Date(b.health.latestTs).getTime() : 0;
    return bTs - aTs;
  });

  // Sort background: most recently approved first
  background.sort((a, b) => {
    const aTs = a.health.latestTs ? new Date(a.health.latestTs).getTime() : 0;
    const bTs = b.health.latestTs ? new Date(b.health.latestTs).getTime() : 0;
    return bTs - aTs;
  });

  return { immediate, active, background };
}

/**
 * Lane header + collapsible project list
 */
function ProjectLane({
  label, sublabel, icon: Icon, color, projects: laneProjects,
  getProjectClientSlug, onUpdateDueDate, defaultExpanded = true,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (laneProjects.length === 0) return null;

  const totalRequests = laneProjects.reduce((s, p) => s + p.allRequests.length, 0);
  const totalOverdue = laneProjects.reduce((s, p) => s + p.health.overdue, 0);

  const colorMap = {
    red: { border: 'border-red-500/40', headerBg: 'bg-red-950/20', headerBorder: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400 border-red-500/40' },
    amber: { border: 'border-amber-500/30', headerBg: 'bg-amber-950/15', headerBorder: 'border-amber-500/20', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
    gray: { border: 'border-gray-700/40', headerBg: 'bg-gray-900/30', headerBorder: 'border-gray-700/30', text: 'text-gray-400', badge: 'bg-gray-700/50 text-gray-400 border-gray-600/40' },
  };
  const c = colorMap[color] || colorMap.gray;

  return (
    <div className={cn("rounded-lg border overflow-hidden", c.border)}>
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className={cn("w-full flex items-center gap-2 px-3 py-2 transition-colors", c.headerBg, "border-b", c.headerBorder)}
      >
        <div className="text-gray-500 shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <Icon className={cn("w-4 h-4 shrink-0", c.text)} />
        <span className={cn("font-semibold text-sm", c.text)}>{label}</span>
        {sublabel && <span className="text-[10px] text-gray-500 hidden lg:inline">{sublabel}</span>}
        <div className="flex-1" />
        {totalOverdue > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
            <AlertCircle className="w-3 h-3" />{totalOverdue}
          </span>
        )}
        <span className="text-[10px] text-gray-500">{laneProjects.length} projects</span>
        <Badge className={cn("text-[10px] px-1.5 py-0", c.badge)}>{totalRequests}</Badge>
      </button>

      {expanded && (
        <div className="p-2 space-y-1.5 bg-black/10">
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
 * ColumnBoardView — Project-consolidated priority lane architecture.
 * 
 * Each project appears ONCE across the entire queue.
 * Projects are triaged into lanes by their worst-case health.
 * 
 * Renders:
 * 1. Momentum Feed
 * 2. 🔥 Immediate Attention (projects with overdue/replied/stalled)
 * 3. ⚡ Active Momentum (projects with active requests)
 * 4. 📦 Background (only approved/archive)
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
    <div className="space-y-3">
      {/* Momentum Feed */}
      <MomentumFeed allRequests={allRequests} />

      {/* 🔥 IMMEDIATE ATTENTION — projects needing action */}
      <ProjectLane
        label="Immediate Attention"
        sublabel="Overdue · Client Replied · Stalled"
        icon={Flame}
        color="red"
        projects={lanes.immediate}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={true}
      />

      {/* ⚡ ACTIVE MOMENTUM — projects in progress */}
      <ProjectLane
        label="Active Momentum"
        sublabel="Awaiting Response · In Progress"
        icon={Zap}
        color="amber"
        projects={lanes.active}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={true}
      />

      {/* 📦 BACKGROUND — only archived/approved */}
      <ProjectLane
        label="Approved Archive"
        sublabel="Historical"
        icon={Archive}
        color="gray"
        projects={lanes.background}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={false}
      />
    </div>
  );
}