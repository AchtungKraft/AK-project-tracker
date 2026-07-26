import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { buildAttentionList, groupByColumn, BOARD_COLUMNS } from "./attentionHelpers";
import AttentionCard from "./AttentionCard";
import AttentionColumnHeader from "./AttentionColumnHeader";
import FollowUpClientGroups from "./FollowUpClientGroups";
import DraftClientGroups from "./DraftClientGroups";
import ClientWaitingGroups from "./ClientWaitingGroups";
import ActiveReviewGroups from "./ActiveReviewGroups";

/**
 * A single scrollable board column.
 */
function BoardColumn({ col, items, onUpdateDueDate, onAction, muted = false }) {
  const isFollowUp = col.key === 'follow_up';
  const isDrafts = col.key === 'needs_sending';
  const isClientWaiting = col.key === 'client_waiting';
  const isActiveReview = col.key === 'review_active';

  return (
    <div className="space-y-2">
      <AttentionColumnHeader {...col} count={items.length} />
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2 scrollbar-hide">
        {items.length === 0 ? (
          <div className="text-center py-4 text-xs text-gray-600 italic">
            {col.emptyText}
          </div>
        ) : isDrafts ? (
          <DraftClientGroups
            items={items}
            onUpdateDueDate={onUpdateDueDate}
            onAction={onAction}
          />
        ) : isClientWaiting ? (
          <ClientWaitingGroups
            items={items}
            onUpdateDueDate={onUpdateDueDate}
            onAction={onAction}
          />
        ) : isActiveReview ? (
          <ActiveReviewGroups
            items={items}
            onUpdateDueDate={onUpdateDueDate}
            onAction={onAction}
          />
        ) : isFollowUp ? (
          <FollowUpClientGroups
            items={items}
            onUpdateDueDate={onUpdateDueDate}
            onAction={onAction}
          />
        ) : (
          items.map(item => (
            <AttentionCard
              key={item.requestId}
              item={item}
              onUpdateDueDate={onUpdateDueDate}
              onAction={onAction}
              muted={muted}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible resolved section below the main board.
 */
function ResolvedSection({ items, onUpdateDueDate }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-700/30">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-2 w-full text-left px-1 py-1.5 rounded-md hover:bg-green-500/5 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-green-400/70" />
        ) : (
          <ChevronRight className="w-4 h-4 text-green-400/70" />
        )}
        <CheckCircle2 className="w-4 h-4 text-green-400/70" />
        <span className="text-sm font-medium text-green-400/80">Resolved</span>
        <Badge className="bg-green-500/15 text-green-400/70 border-green-500/30 text-xs px-1.5 py-0">
          {items.length}
        </Badge>
        {!expanded && (
          <span className="text-xs text-gray-600 ml-auto">Click to expand</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
          {items.map(item => (
            <AttentionCard
              key={item.requestId}
              item={item}
              onUpdateDueDate={onUpdateDueDate}
              muted
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * NeedsAttentionSection — Action Queue with 3 active columns + resolved below.
 */
const NeedsAttentionSection = ({ 
  projectGroups,
  onUpdateDueDate,
  onCardAction
}) => {
  const attentionItems = useMemo(() => buildAttentionList(projectGroups), [projectGroups]);
  const columnData = useMemo(() => groupByColumn(attentionItems), [attentionItems]);

  if (attentionItems.length === 0) return null;

  const actionableCount = attentionItems.length;

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
        {/* 3-Column Active Board */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
          {BOARD_COLUMNS.map(col => (
            <BoardColumn
              key={col.key}
              col={col}
              items={columnData[col.key] || []}
              onUpdateDueDate={onUpdateDueDate}
              onAction={onCardAction}
              muted={col.key === 'follow_up'}
            />
          ))}
        </div>

        {/* Resolved section removed — approved items now appear inline in Active Review */}
      </CardContent>
    </Card>
  );
};

export default React.memo(NeedsAttentionSection);