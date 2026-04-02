import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATE_COLORS = {
  PLANNED: "bg-gray-700 text-gray-300",
  NEEDS_ORDER: "bg-amber-900/50 text-amber-300",
  COVERED: "bg-blue-900/50 text-blue-300",
  INSTALL_READY: "bg-emerald-900/50 text-emerald-300",
  INSTALLED: "bg-gray-600 text-gray-300",
};

export default function BackfillConfirmModal({ preview, onConfirm, onClose, isLoading }) {
  if (!preview || !preview.conversions?.length) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Confirm Backfill</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-400">
            {preview.conversions.length} commitment(s) will be converted from PO coverage → stock reservation.
          </p>

          <div className="space-y-2">
            {preview.conversions.map((c) => (
              <div key={c.commitment_id} className="bg-gray-800/60 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white font-medium truncate max-w-[200px]">
                    {c.part_name}
                  </span>
                  <span className="text-xs text-purple-400 font-mono">
                    qty: {c.convertible_qty}
                  </span>
                </div>

                {/* Before → After quantities */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-gray-900/50 rounded p-1.5">
                    <span className="text-gray-500">Before</span>
                    <div className="text-gray-300 mt-0.5">
                      PO: {c.before.covered_from_po} · Stock: {c.before.reserved_from_stock}
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded p-1.5">
                    <span className="text-gray-500">After</span>
                    <div className="text-green-300 mt-0.5">
                      PO: {c.after.covered_from_po} · Stock: {c.after.reserved_from_stock}
                    </div>
                  </div>
                </div>

                {/* Lifecycle transition */}
                <div className="flex items-center gap-2 text-[10px]">
                  <Badge className={cn("text-[10px] px-1.5 py-0", STATE_COLORS[c.before.lifecycle_state] || "bg-gray-700 text-gray-300")}>
                    {c.before.lifecycle_state}
                  </Badge>
                  <ArrowRight className="w-3 h-3 text-gray-500" />
                  <Badge className={cn("text-[10px] px-1.5 py-0", STATE_COLORS[c.after.projected_lifecycle_state] || "bg-gray-700 text-gray-300")}>
                    {c.after.projected_lifecycle_state}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {preview.skipped?.length > 0 && (
            <div className="text-[10px] text-gray-500">
              {preview.skipped.length} commitment(s) skipped (no eligible qty).
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600" disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Apply Backfill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}