import React, { useState, useMemo } from "react";
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
 * Shown when completing a task that has associated parts (via TaskPartLink).
 * Lets the user optionally install pending parts before completing the task.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void  (cancel — do nothing)
 *  - onInstallAndComplete: (selectedCommitmentIds: string[]) => void
 *  - onSkipAndComplete: () => void
 *  - taskName: string
 *  - parts: Array<{ linkId, partName, partNumber, commitmentId, qtyAllocated, qtyInstalled, installable }>
 *  - isLoading: boolean
 */
export default function InstallPartsOnCompleteModal({
  isOpen,
  onClose,
  onInstallAndComplete,
  onSkipAndComplete,
  taskName,
  parts = [],
  isLoading = false,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Only show parts that can actually be installed
  const installableParts = useMemo(
    () => parts.filter((p) => p.installable > 0),
    [parts]
  );

  // Already-installed parts for display
  const installedParts = useMemo(
    () => parts.filter((p) => p.installable <= 0 && p.qtyInstalled > 0),
    [parts]
  );

  const toggleSelection = (commitmentId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(commitmentId)) next.delete(commitmentId);
      else next.add(commitmentId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(installableParts.map((p) => p.commitmentId)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const handleInstallAndComplete = () => {
    onInstallAndComplete(Array.from(selectedIds));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-green-400" />
            Install Associated Parts?
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            <span className="text-white font-medium">{taskName}</span> has parts
            linked to it. Would you like to install them before completing?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Installable parts */}
          {installableParts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Ready to Install
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Select All
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    onClick={selectNone}
                    className="text-xs text-gray-400 hover:text-gray-300"
                  >
                    None
                  </button>
                </div>
              </div>

              {installableParts.map((p) => (
                <label
                  key={p.commitmentId}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.has(p.commitmentId)}
                    onCheckedChange={() => toggleSelection(p.commitmentId)}
                    disabled={isLoading}
                  />
                  <Package className="w-4 h-4 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{p.partName}</p>
                    {p.partNumber && (
                      <p className="text-xs text-gray-500 font-mono">
                        {p.partNumber}
                      </p>
                    )}
                  </div>
                  <Badge className="bg-green-900/40 text-green-400 border-green-700 text-xs shrink-0">
                    {p.installable} ready
                  </Badge>
                </label>
              ))}
            </div>
          )}

          {/* Already installed parts (info only) */}
          {installedParts.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Already Installed
              </span>
              {installedParts.map((p) => (
                <div
                  key={p.commitmentId || p.linkId}
                  className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/30 opacity-60"
                >
                  <Package className="w-4 h-4 text-gray-600 shrink-0" />
                  <span className="text-sm text-gray-400 truncate flex-1">
                    {p.partName}
                  </span>
                  <Badge className="bg-gray-800 text-gray-500 border-gray-700 text-xs shrink-0">
                    {p.qtyInstalled} installed
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {installableParts.length === 0 && (
            <div className="text-center py-3 text-gray-500 text-sm">
              All linked parts are already installed or have no reserved stock.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
          {installableParts.length > 0 && selectedIds.size > 0 && (
            <Button
              onClick={handleInstallAndComplete}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 w-full"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4 mr-2" />
              )}
              Install {selectedIds.size} Part
              {selectedIds.size !== 1 ? "s" : ""} & Complete
            </Button>
          )}

          <Button
            variant="outline"
            onClick={onSkipAndComplete}
            disabled={isLoading}
            className="w-full border-gray-600"
          >
            Complete Without Installing
          </Button>

          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
            className="w-full text-gray-400"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}