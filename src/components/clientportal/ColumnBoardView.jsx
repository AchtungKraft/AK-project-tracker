import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { 
  Flame, 
  Zap, 
  Archive,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import ProjectLifecycleCard from "./ProjectLifecycleCard";
import RecentlyApprovedStrip from "./RecentlyApprovedStrip";
import { isRequestOverdue } from "./lifecycleHelpers";

const STALE_THRESHOLD_DAYS = 3;

/**
 * Compute project-level health from grouped bucket data.
 */
function computeProjectHealth(group) {
  const bucketKeys = ['draft', 'awaiting_client', 'client_replied', 'recently_approved', 'approved'];
  let overdue = 0, waiting = 0, replied = 0, recentApproval = 0, approvedArchive = 0, drafts = 0;
  let latestTs = null;

  for (const bk of bucketKeys) {
    for (const r of (group[bk] || [])) {
      const ts = r.latestActivityAt || r.updated_date;
      if (ts && (!latestTs || new Date(ts) > new Date(latestTs))) latestTs = ts;

      if (bk === 'recently_approved') { recentApproval++; continue; }
      if (bk === 'approved') { approvedArchive++; continue; }
      if (bk === 'draft') { drafts++; continue; }
      if (isRequestOverdue(r, bk)) overdue++;
      if (bk === 'client_replied') replied++;
      else if (bk === 'awaiting_client' && !isRequestOverdue(r, bk)) waiting++;
    }
  }

  const active = overdue + waiting + replied + drafts;
  const daysSinceActivity = latestTs 
    ? (Date.now() - new Date(latestTs).getTime()) / (1000 * 60 * 60 * 24) 
    : 999;
  const isStalled = daysSinceActivity >= STALE_THRESHOLD_DAYS && active > 0;
  const totalRequests = bucketKeys.reduce((s, bk) => s + (group[bk]?.length || 0), 0);

  return { overdue, waiting, replied, recentApproval, approvedArchive, drafts, active, latestTs, isStalled, daysSinceActivity, totalRequests };
}

/**
 * Triage project groups into priority lanes based on health.
 */
function triageProjectGroups(filteredProjectData) {
  const immediate = [];
  const active = [];
  const background = [];

  for (const group of filteredProjectData) {
    const h = computeProjectHealth(group);
    const entry = { group, health: h };

    if (h.overdue > 0 || h.replied > 0 || (h.isStalled && h.active > 0)) {
      immediate.push(entry);
    } else if (h.active > 0 || h.recentApproval > 0) {
      active.push(entry);
    } else {
      background.push(entry);
    }
  }

  // Sort immediate: most overdue first, then most replied, then most stalled
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
 * Production lane — section header + project cards.
 */
function ProductionLane({
  label, icon: Icon, color, entries,
  getProjectClientSlug, onUpdateDueDate, sendingEmailForProject, onSendBulkEmail,
  defaultExpanded = true,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (entries.length === 0) return null;

  const totalRequests = entries.reduce((s, e) => s + e.health.totalRequests, 0);
  const totalOverdue = entries.reduce((s, e) => s + e.health.overdue, 0);

  const colorMap = {
    red: { text: 'text-red-400', border: 'border-red-500/30', headerBg: 'bg-red-950/20', badge: 'bg-red-500/20 text-red-400 border-red-500/40' },
    amber: { text: 'text-amber-400', border: 'border-amber-500/20', headerBg: 'bg-amber-950/15', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
    gray: { text: 'text-gray-400', border: 'border-gray-700/30', headerBg: 'bg-gray-900/30', badge: 'bg-gray-700/50 text-gray-400 border-gray-600/40' },
  };
  const c = colorMap[color] || colorMap.gray;

  return (
    <div className={cn("rounded-lg border overflow-hidden", c.border)}>
      {/* Lane header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className={cn("w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors", c.headerBg, "border-b", c.border)}
      >
        <div className="text-gray-500 shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <Icon className={cn("w-4 h-4 shrink-0", c.text)} />
        <span className={cn("font-semibold text-sm", c.text)}>{label}</span>
        {totalOverdue > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-semibold">
            <AlertCircle className="w-3 h-3" />{totalOverdue} overdue
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{entries.length} projects</span>
        <Badge className={cn("text-xs px-1.5 py-0", c.badge)}>{totalRequests}</Badge>
      </button>

      {/* Project cards */}
      {expanded && (
        <div className="p-3 space-y-3 bg-black/10">
          {entries.map((entry, idx) => (
            <ProjectLifecycleCard
              key={entry.group.project?.id || `unknown-${idx}`}
              project={entry.group.project}
              buckets={{
                draft: entry.group.draft,
                awaiting_client: entry.group.awaiting_client,
                client_replied: entry.group.client_replied,
                recently_approved: entry.group.recently_approved,
                approved: entry.group.approved,
              }}
              getProjectClientSlug={getProjectClientSlug}
              onSendBulkEmail={onSendBulkEmail}
              sendingEmailForProject={sendingEmailForProject}
              onUpdateDueDate={onUpdateDueDate}
              initialCollapsed={entry.health.totalRequests > 5}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ColumnBoardView — Production Board with project cards organized by priority lanes.
 * 
 * Lanes:
 * 1. 🔥 Immediate Attention — projects with overdue, client replies, or stalled items
 * 2. ⚡ Active Momentum — projects with active requests in progress
 * 3. 📦 Resolved — only approved/archived projects
 */
export default function ColumnBoardView({
  filteredProjectData,
  projects,
  getProjectClientSlug,
  onUpdateDueDate,
  lifecycleQuickFilter,
  onSendBulkEmail,
  sendingEmailForProject,
}) {
  const lanes = useMemo(
    () => triageProjectGroups(filteredProjectData),
    [filteredProjectData]
  );

  // Collect all recently approved for strip
  const allRecentlyApproved = useMemo(() => {
    return filteredProjectData.flatMap(g => g.recently_approved || []);
  }, [filteredProjectData]);

  if (filteredProjectData.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Recently Approved Strip */}
      {lifecycleQuickFilter === 'all' && allRecentlyApproved.length > 0 && (
        <RecentlyApprovedStrip
          requests={allRecentlyApproved}
          getProjectClientSlug={getProjectClientSlug}
        />
      )}

      {/* 🔥 IMMEDIATE ATTENTION */}
      <ProductionLane
        label="Immediate Attention"
        icon={Flame}
        color="red"
        entries={lanes.immediate}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        onSendBulkEmail={onSendBulkEmail}
        sendingEmailForProject={sendingEmailForProject}
        defaultExpanded={true}
      />

      {/* ⚡ ACTIVE MOMENTUM */}
      <ProductionLane
        label="Active Momentum"
        icon={Zap}
        color="amber"
        entries={lanes.active}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        onSendBulkEmail={onSendBulkEmail}
        sendingEmailForProject={sendingEmailForProject}
        defaultExpanded={true}
      />

      {/* 📦 RESOLVED */}
      <ProductionLane
        label="Resolved"
        icon={Archive}
        color="gray"
        entries={lanes.background}
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        onSendBulkEmail={onSendBulkEmail}
        sendingEmailForProject={sendingEmailForProject}
        defaultExpanded={false}
      />
    </div>
  );
}