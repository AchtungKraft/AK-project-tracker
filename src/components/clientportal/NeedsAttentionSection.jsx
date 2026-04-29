import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { buildAttentionList, groupByColumn, BOARD_COLUMNS, isRecentActivity } from "./attentionHelpers";
import AttentionCard from "./AttentionCard";
import AttentionColumnHeader from "./AttentionColumnHeader";

/**
 * Renders a single board column with optional Active/Backlog split and scroll cap.
 */
function BoardColumn({ col, items, onUpdateDueDate }) {
  const isReviewColumn = col.key === 'needs_review';
  const isCompletedColumn = col.key === 'completed';
  const [showCompleted, setShowCompleted] = useState(false);

  // Split review column into active + backlog
  const activeItems = isReviewColumn ? items.filter(isRecentActivity) : items;
  const backlogItems = isReviewColumn ? items.filter(i => !isRecentActivity(i)) : [];

  // Completed column: collapsed by default
  if (isCompletedColumn) {
    return (
      <div className="space-y-2">
        <AttentionColumnHeader {...col} count={items.length} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCompleted(prev => !prev)}
          className="w-full text-xs text-green-400/70 hover:text-green-400 hover:bg-green-500/10 gap-1"
        >
          {showCompleted ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {showCompleted ? 'Hide Completed' : `Show ${items.length} Completed`}
        </Button>
        {showCompleted && (
          <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2 scrollbar-hide">
            {items.length === 0 ? (
              <EmptyState text={col.emptyText} />
            ) : (
              items.map(item => (
                <AttentionCard key={item.requestId} item={item} onUpdateDueDate={onUpdateDueDate} muted />
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // Review column with Active/Backlog split
  if (isReviewColumn) {
    return (
      <div className="space-y-2">
        <AttentionColumnHeader {...col} count={items.length} />
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2 scrollbar-hide">
          {items.length === 0 ? (
            <EmptyState text={col.emptyText} />
          ) : (
            <>
              {activeItems.length > 0 && (
                <div className="space-y-2">
                  <SubSectionLabel label="Active" count={activeItems.length} color="amber" />
                  {activeItems.map(item => (
                    <AttentionCard key={item.requestId} item={item} onUpdateDueDate={onUpdateDueDate} />
                  ))}
                </div>
              )}
              {backlogItems.length > 0 && (
                <div className="space-y-2">
                  <SubSectionLabel label="Backlog" count={backlogItems.length} color="gray" />
                  {backlogItems.map(item => (
                    <AttentionCard key={item.requestId} item={item} onUpdateDueDate={onUpdateDueDate} muted />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Default column (Client Waiting)
  return (
    <div className="space-y-2">
      <AttentionColumnHeader {...col} count={items.length} />
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2 scrollbar-hide">
        {items.length === 0 ? (
          <EmptyState text={col.emptyText} />
        ) : (
          items.map(item => (
            <AttentionCard key={item.requestId} item={item} onUpdateDueDate={onUpdateDueDate} />
          ))
        )}
      </div>
    </div>
  );
}

function SubSectionLabel({ label, count, color }) {
  const colors = {
    amber: 'text-amber-500/70 border-amber-500/20',
    gray: 'text-gray-600 border-gray-700/30',
  };
  const c = colors[color] || colors.gray;
  return (
    <div className={`flex items-center gap-2 px-2 py-1 border-b ${c}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${c.split(' ')[0]}`}>{label}</span>
      <span className="text-[10px] text-gray-600">{count}</span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-4 text-xs text-gray-600 italic">
      {text}
    </div>
  );
}

/**
 * NeedsAttentionSection — Unified Action Queue + Task Board
 */
const NeedsAttentionSection = ({ 
  projectGroups,
  onUpdateDueDate
}) => {
  const attentionItems = useMemo(() => buildAttentionList(projectGroups), [projectGroups]);
  const columnData = useMemo(() => groupByColumn(attentionItems), [attentionItems]);

  if (attentionItems.length === 0) return null;

  // Count excluding completed for main badge
  const actionableCount = attentionItems.filter(i => i.type !== 'approved_recent').length;

  return (
    <Card className="bg-gradient-to-r from-red-950/40 to-orange-950/40 backdrop-blur-xl border-2 border-red-500/50 shadow-lg shadow-red-900/20">
      <CardHeader className="border-b border-red-500/30 px-3 py-2 md:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 md:p-2 bg-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
            </div>
            <CardTitle className="text-sm md:text-lg text-red-400">
              Action Queue
            </CardTitle>
          </div>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-sm md:text-lg px-2 py-0.5 md:py-1">
            {actionableCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {BOARD_COLUMNS.map(col => (
            <BoardColumn
              key={col.key}
              col={col}
              items={columnData[col.key] || []}
              onUpdateDueDate={onUpdateDueDate}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(NeedsAttentionSection);