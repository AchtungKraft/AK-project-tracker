import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { buildAttentionList, groupByColumn, groupColumnByProject, BOARD_COLUMNS } from "./attentionHelpers";
import AttentionColumnHeader from "./AttentionColumnHeader";
import ActionQueueProjectGroup from "./ActionQueueProjectGroup";
import ActionQueueCard from "./ActionQueueCard";

// Outer columns render readable cards (no project grouping)
const OUTER_COLUMN_KEYS = new Set(['needs_sending', 'follow_up']);

/**
 * OuterColumn — renders items as individual readable cards.
 * Used for Drafts and Follow-Up where grouping isn't needed.
 */
function OuterColumn({ col, items, onUpdateDueDate }) {
  return (
    <div className="space-y-2">
      <AttentionColumnHeader
        label={col.label}
        subtitle={col.subtitle}
        count={items.length}
        headerBg={col.headerBg}
        headerBorder={col.headerBorder}
        headerText={col.headerText}
        countBg={col.countBg}
        countText={col.countText}
      />
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2 scrollbar-hide">
        {items.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-600 italic">
            {col.emptyText}
          </div>
        ) : (
          items.map(item => (
            <ActionQueueCard
              key={item.requestId}
              item={item}
              onUpdateDueDate={onUpdateDueDate}
              columnKey={col.key}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * CenterColumn — project-grouped for Client Waiting and Active Review.
 * Multi-request projects show a collapsible group header.
 * Single-request projects render with lightweight header.
 */
function CenterColumn({ col, items, onUpdateDueDate }) {
  const projectGroups = useMemo(
    () => groupColumnByProject(items),
    [items]
  );

  return (
    <div className="space-y-2">
      <AttentionColumnHeader
        label={col.label}
        subtitle={col.subtitle}
        count={items.length}
        headerBg={col.headerBg}
        headerBorder={col.headerBorder}
        headerText={col.headerText}
        countBg={col.countBg}
        countText={col.countText}
      />
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2 scrollbar-hide">
        {projectGroups.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-600 italic">
            {col.emptyText}
          </div>
        ) : (
          projectGroups.map(group => (
            <ActionQueueProjectGroup
              key={group.projectId}
              projectName={group.projectName}
              projectId={group.projectId}
              items={group.items}
              columnKey={col.key}
              onUpdateDueDate={onUpdateDueDate}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible resolved section below the main board.
 * Shows recently approved items — project-grouped.
 */
function ResolvedSection({ items, onUpdateDueDate }) {
  const [expanded, setExpanded] = useState(false);
  const projectGroups = useMemo(
    () => groupColumnByProject(items),
    [items]
  );

  if (items.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-gray-700/30">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-md hover:bg-green-950/20 transition-colors group/resolved"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-green-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-green-400" />
        )}
        <CheckCircle2 className="w-4 h-4 text-green-400" />
        <span className="text-sm font-semibold text-green-400">Resolved</span>
        <Badge className="bg-green-500/20 text-green-400 border-green-500/40 text-xs px-2 py-0.5 font-medium">
          {items.length}
        </Badge>
        {!expanded && (
          <span className="text-xs text-gray-500 ml-auto">Click to expand</span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {projectGroups.map(group => (
            <ActionQueueProjectGroup
              key={group.projectId}
              projectName={group.projectName}
              projectId={group.projectId}
              items={group.items}
              columnKey="resolved"
              onUpdateDueDate={onUpdateDueDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * NeedsAttentionSection — Action Queue with 4 active columns + resolved below.
 * 
 * Now project-grouped: multiple requests from the same project are consolidated
 * under a collapsible project header. Single-request projects render as rows.
 */
const NeedsAttentionSection = ({ 
  projectGroups,
  onUpdateDueDate
}) => {
  const attentionItems = useMemo(() => buildAttentionList(projectGroups), [projectGroups]);
  const columnData = useMemo(() => groupByColumn(attentionItems), [attentionItems]);

  if (attentionItems.length === 0) return null;

  const actionableCount = attentionItems.filter(i => i.type !== 'approved_recent').length;

  return (
    <Card className="bg-gradient-to-r from-red-950/40 to-orange-950/40 backdrop-blur-xl border-2 border-red-500/50 shadow-lg shadow-red-900/20">
      <CardHeader className="border-b border-red-500/30 px-3 py-2 md:px-4 md:py-3">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 md:p-2 bg-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
          </div>
          <div>
            <CardTitle className="text-sm md:text-lg text-red-400">
              Action Queue
            </CardTitle>
            <div className="hidden md:flex gap-3 text-[11px] text-gray-500 mt-0.5">
              <span>{(columnData.needs_sending || []).length} drafts</span>
              <span>{(columnData.client_waiting || []).length} waiting</span>
              <span>{(columnData.review_active || []).length} review</span>
              <span>{(columnData.follow_up || []).length} follow-up</span>
            </div>
          </div>
        </div>
        <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-sm md:text-lg px-2 py-0.5 md:py-1">
          {actionableCount}
        </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-4">
        {/* 4-Column Active Board — outer columns use cards, center columns use project groups */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-5">
          {BOARD_COLUMNS.map(col => {
            const items = columnData[col.key] || [];
            if (OUTER_COLUMN_KEYS.has(col.key)) {
              return <OuterColumn key={col.key} col={col} items={items} onUpdateDueDate={onUpdateDueDate} />;
            }
            return <CenterColumn key={col.key} col={col} items={items} onUpdateDueDate={onUpdateDueDate} />;
          })}
        </div>

        {/* Resolved Section — below the board */}
        <ResolvedSection
          items={columnData.resolved || []}
          onUpdateDueDate={onUpdateDueDate}
        />
      </CardContent>
    </Card>
  );
};

export default React.memo(NeedsAttentionSection);