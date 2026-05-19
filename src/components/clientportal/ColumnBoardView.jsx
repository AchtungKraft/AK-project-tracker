import React, { useMemo } from "react";
import { 
  Flame, 
  Zap, 
  Archive,
  Wrench,
  Clock,
  MessageSquareText,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import MomentumFeed from "./MomentumFeed";
import PriorityLane from "./PriorityLane";
import RecentlyApprovedStrip from "./RecentlyApprovedStrip";

/**
 * Aggregate all requests from project groups into a flat enriched list,
 * then triage into priority lanes.
 */
function triageRequests(filteredProjectData) {
  const all = [];
  
  for (const group of filteredProjectData) {
    const pName = group.project?.name || 'Unknown Project';
    const pId = group.project?.id || 'unknown';
    
    const bucketKeys = ['draft', 'awaiting_client', 'client_replied', 'recently_approved', 'approved'];
    for (const bk of bucketKeys) {
      for (const r of (group[bk] || [])) {
        all.push({ ...r, _projectName: pName, _projectId: pId, _bucket: bk });
      }
    }
  }

  // === TRIAGE INTO LANES ===
  const immediate = [];   // 🔥 overdue, stalled 3d+, client replied (needs action)
  const active = [];      // ⚡ awaiting client (recent), active drafts
  const background = [];  // 📦 low priority, approved archive
  const recentlyApproved = []; // ✓ separate strip

  const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

  for (const r of all) {
    if (r._bucket === 'recently_approved') {
      recentlyApproved.push(r);
      continue;
    }
    if (r._bucket === 'approved') {
      background.push(r);
      continue;
    }

    const isOverdue = r.isOverdue;
    const isStalled = r.latestActivityAt && 
      (Date.now() - new Date(r.latestActivityAt).getTime()) > STALE_THRESHOLD_MS;
    const isClientReplied = r._bucket === 'client_replied';

    if (isOverdue || isClientReplied || (isStalled && r._bucket !== 'draft')) {
      immediate.push(r);
    } else if (r._bucket === 'draft') {
      active.push(r);
    } else {
      // awaiting_client, not overdue, not stalled
      active.push(r);
    }
  }

  // Sort immediate: overdue first, then stalled, then client replied
  immediate.sort((a, b) => {
    const aOd = a.isOverdue ? 1 : 0;
    const bOd = b.isOverdue ? 1 : 0;
    if (aOd !== bOd) return bOd - aOd;
    // Then by staleness
    const aTs = a.latestActivityAt ? new Date(a.latestActivityAt).getTime() : 0;
    const bTs = b.latestActivityAt ? new Date(b.latestActivityAt).getTime() : 0;
    return aTs - bTs; // oldest activity first
  });

  // Sort active: most recent activity first
  active.sort((a, b) => {
    const aTs = a.latestActivityAt ? new Date(a.latestActivityAt).getTime() : 0;
    const bTs = b.latestActivityAt ? new Date(b.latestActivityAt).getTime() : 0;
    return bTs - aTs;
  });

  // Sort recently approved: newest first
  recentlyApproved.sort((a, b) => {
    const aTs = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
    const bTs = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
    return bTs - aTs;
  });

  return { immediate, active, background, recentlyApproved, all };
}

/**
 * ColumnBoardView — Priority Lane architecture.
 * 
 * Renders:
 * 1. Momentum Feed (recent activity ticker)
 * 2. Recently Approved Strip
 * 3. 🔥 Immediate Attention lane (overdue, stalled, client replied)
 * 4. ⚡ Active Momentum lane (awaiting client, drafts)
 * 5. 📦 Background lane (approved archive)
 */
export default function ColumnBoardView({
  filteredProjectData,
  projects,
  getProjectClientSlug,
  onUpdateDueDate,
  lifecycleQuickFilter,
}) {
  const lanes = useMemo(
    () => triageRequests(filteredProjectData),
    [filteredProjectData]
  );

  const hasAny = lanes.all.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {/* Momentum Feed — operational awareness */}
      <MomentumFeed allRequests={lanes.all} />

      {/* Recently Approved Strip */}
      {lifecycleQuickFilter === 'all' && lanes.recentlyApproved.length > 0 && (
        <RecentlyApprovedStrip
          requests={lanes.recentlyApproved}
          getProjectClientSlug={getProjectClientSlug}
        />
      )}

      {/* 🔥 IMMEDIATE ATTENTION */}
      <PriorityLane
        label="Immediate Attention"
        sublabel="Overdue · Client Replied · Stalled"
        icon={Flame}
        color="red"
        requests={lanes.immediate}
        bucket="awaiting_client"
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={true}
        showProjectStacks={true}
      />

      {/* ⚡ ACTIVE MOMENTUM */}
      <PriorityLane
        label="Active Momentum"
        sublabel="Awaiting Response · Drafts in Progress"
        icon={Zap}
        color="amber"
        requests={lanes.active}
        bucket="awaiting_client"
        getProjectClientSlug={getProjectClientSlug}
        onUpdateDueDate={onUpdateDueDate}
        defaultExpanded={true}
        showProjectStacks={true}
      />

      {/* Recently Approved (when filtered) */}
      {lifecycleQuickFilter !== 'all' && lanes.recentlyApproved.length > 0 && (
        <PriorityLane
          label="Recently Approved"
          sublabel="Last 48h"
          icon={CheckCircle2}
          color="emerald"
          requests={lanes.recentlyApproved}
          bucket="recently_approved"
          getProjectClientSlug={getProjectClientSlug}
          onUpdateDueDate={onUpdateDueDate}
          defaultExpanded={true}
          showProjectStacks={false}
        />
      )}

      {/* 📦 BACKGROUND / ARCHIVE */}
      {lanes.background.length > 0 && (
        <PriorityLane
          label="Approved Archive"
          sublabel="Historical"
          icon={Archive}
          color="gray"
          requests={lanes.background}
          bucket="approved"
          getProjectClientSlug={getProjectClientSlug}
          onUpdateDueDate={onUpdateDueDate}
          defaultExpanded={false}
          showProjectStacks={false}
        />
      )}
    </div>
  );
}