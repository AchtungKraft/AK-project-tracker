import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, Package } from "lucide-react";

/**
 * InstallPartsOnCompleteModal
 *
 * Displays ONLY installable commitments (remaining_qty > 0).
 * Fully-installed or zero-qty commitments are never shown.
 * All commitments are selected by default for fastest workflow.
 *
 * Props:
 *  - isOpen
 *  - onClose (cancel — no changes)
 *  - onInstallAndComplete (selectedCommitmentIds: string[])
 *  - onSkipAndComplete
 *  - taskName
 *  - commitments: Array<{ commitmentId, partName, partNumber, remainingQty }>
 *  - isProcessing: boolean — locks all interactions during install execution
 */
export default function InstallPartsOnCompleteModal({
  isOpen,
  onClose,
  onInstallAndComplete,
  onSkipAndComplete,
  taskName,
  commitments = [],
  isProcessing = false,
}) {
  // Default: ALL selected
  const [selectedIds, setSelectedIds] = useState(() =>
    new Set(commitments.map((c) => c.commitmentId))
  );

  // Reset selection whenever commitments change (modal reopens)
  useEffect(() => {
    setSelectedIds(new Set(commitments.map((c) => c.commitmentId)));
  }, [commitments]);

  // Group commitments by part for display
  const groupedByPart = useMemo(() => {
    const map = new Map();
    for (const c of commitments) {
      const key = c.partName;
      if (!map.has(key)) {
        map.set(key, { partName: c.partName, partNumber: c.partNumber, items: [] });
      }
      map.get(key).items.push(c);
    }
    return Array.from(map.values());
  }, [commitments]);

  const toggleSelection = (commitmentId) => {
    if (isProcessing) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(commitmentId)) next.delete(commitmentId);
      else next.add(commitmentId);
      return next;
    });
  };

  const selectAll = () => {
    if (isProcessing) return;
    setSelectedIds(new Set(commitments.map((c) => c.commitmentId)));
  };

  const selectNone = () => {
    if (isProcessing) return;
    setSelectedIds(new Set());
  };

  const handleInstallAndComplete = () => {
    if (isProcessing) return;
    onInstallAndComplete(Array.from(selectedIds));
  };

  return (
    <Dialog open={isOpen} onOpenChange={isProcessing ? undefined : onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-green-400" />
            Install Associated Parts?
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            <span className="text-white font-medium">{taskName}</span> has
            commitments ready to install. Select which to install before completing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {commitments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Ready to Install ({commitments.length})
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    disabled={isProcessing}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    Select All
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    onClick={selectNone}
                    disabled={isProcessing}
                    className="text-xs text-gray-400 hover:text-gray-300 disabled:opacity-50"
                  >
                    None
                  </button>
                </div>
              </div>

              {groupedByPart.map((group) => (
                <div key={group.partName} className="space-y-1">
                  {group.items.length > 1 && (
                    <p className="text-xs text-gray-400 font-medium px-1 pt-1">
                      {group.partName}
                      {group.partNumber && (
                        <span className="text-gray-600 font-mono ml-1">
                          {group.partNumber}
                        </span>
                      )}
                    </p>
                  )}
                  {group.items.map((c) => (
                    <label
                      key={c.commitmentId}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedIds.has(c.commitmentId)}
                        onCheckedChange={() => toggleSelection(c.commitmentId)}
                        disabled={isProcessing}
                      />
                      <Package className="w-4 h-4 text-gray-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{c.partName}</p>
                        {c.partNumber && group.items.length <= 1 && (
                          <p className="text-xs text-gray-500 font-mono">
                            {c.partNumber}
                          </p>
                        )}
                      </div>
                      <Badge className="bg-green-900/40 text-green-400 border-green-700 text-xs shrink-0">
                        Qty {c.remainingQty}
                      </Badge>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
          {selectedIds.size > 0 && (
            <Button
              onClick={handleInstallAndComplete}
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700 w-full"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4 mr-2" />
              )}
              {isProcessing
                ? "Installing…"
                : `Install ${selectedIds.size} & Complete`}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={onSkipAndComplete}
            disabled={isProcessing}
            className="w-full border-gray-600"
          >
            Complete Without Installing
          </Button>

          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full text-gray-400"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}