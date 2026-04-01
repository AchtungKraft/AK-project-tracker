import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * ZeroCostConfirmModal - Confirmation before creating/saving a PO line with $0 cost
 * 
 * GUARDRAIL: Requires explicit "Continue Anyway" to proceed
 */
export default function ZeroCostConfirmModal({ open, onClose, onConfirm, partName, qty }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-amber-700/50 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Zero Cost Warning
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            This PO line has no cost set.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3">
          {partName && (
            <div className="p-2 bg-gray-800/50 rounded text-sm text-gray-300">
              {partName} {qty ? `× ${qty}` : ''}
            </div>
          )}
          <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg text-sm text-amber-300">
            <p className="font-medium mb-1">This line has no cost and will not update project pricing.</p>
            <p className="text-xs text-amber-400/70">
              The commitment's cost snapshot will remain unchanged. You can edit the PO line cost later and sync to update pricing.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Continue Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}