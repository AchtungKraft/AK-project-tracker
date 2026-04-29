import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { buildAttentionList, groupByColumn, BOARD_COLUMNS } from "./attentionHelpers";
import AttentionCard from "./AttentionCard";
import AttentionColumnHeader from "./AttentionColumnHeader";

/**
 * NeedsAttentionSection — Unified Action Queue + Task Board
 * 
 * Uses buildAttentionList as SINGLE source of truth for attention logic.
 * Displays a 3-column task board: Client Waiting | Needs Review | Completed
 */
const NeedsAttentionSection = ({ 
  projectGroups,
  onUpdateDueDate
}) => {
  // Build unified attention list from enriched project groups
  const attentionItems = useMemo(() => {
    return buildAttentionList(projectGroups);
  }, [projectGroups]);

  // Group by board column
  const columnData = useMemo(() => {
    return groupByColumn(attentionItems);
  }, [attentionItems]);

  // Don't render if no attention items
  if (attentionItems.length === 0) return null;

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
            {attentionItems.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2 md:p-4">
        {/* 3-Column Task Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {BOARD_COLUMNS.map(col => {
            const items = columnData[col.key] || [];
            return (
              <div key={col.key} className="space-y-2">
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
                {items.length === 0 ? (
                  <div className="text-center py-4 text-xs text-gray-600 italic">
                    {col.emptyText}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map(item => (
                      <AttentionCard
                        key={item.requestId}
                        item={item}
                        onUpdateDueDate={onUpdateDueDate}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(NeedsAttentionSection);