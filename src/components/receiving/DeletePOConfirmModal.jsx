import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Trash2 } from "lucide-react";

/**
 * DeletePOConfirmModal — Confirms PO deletion with reason input.
 * On confirm, calls the DELETE_PO action via executeSupplyAction.
 */
export default function DeletePOConfirmModal({ po, onConfirm, onClose, isDeleting }) {
  const [reason, setReason] = useState("");

  const lineCount = po?.lines?.length ?? 0;
  const totalQtyOrdered = po?.total_qty_ordered ?? 0;
  const totalQtyReceived = po?.total_qty_received ?? 0;
  const hasReceived = totalQtyReceived > 0;
  const isInvoiced = po?.billing_status && po.billing_status !== 'Not Invoiced';

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Delete Purchase Order
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400 space-y-3">
            <p>
              This will permanently delete <span className="text-white font-mono font-bold">{po?.po_number}</span> and
              restore all demand back to the ordering queue.
            </p>

            <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Line items:</span>
                <span className="text-white">{lineCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total ordered:</span>
                <span className="text-white">{totalQtyOrdered} units</span>
              </div>
              {hasReceived && (
                <div className="flex justify-between text-amber-400">
                  <span>Already received:</span>
                  <span>{totalQtyReceived} units</span>
                </div>
              )}
            </div>

            {isInvoiced && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-xs text-red-300">
                <strong>Blocked:</strong> This PO has been invoiced ({po.billing_status}).
                Invoiced POs cannot be deleted. Remove the invoice first.
              </div>
            )}

            {hasReceived && !isInvoiced && (
              <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 text-xs text-amber-300">
                <strong>Warning:</strong> Some items have already been received.
                Deleting will reduce covered_from_po but will NOT remove received inventory.
                You may need to manually adjust stock afterwards.
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Reason for deletion (optional)</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Duplicate PO, ordered from wrong vendor..."
                className="bg-gray-800 border-gray-700 text-white text-sm h-20"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-gray-800 border-gray-700 text-gray-300">
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={isDeleting || isInvoiced}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {isInvoiced ? "Cannot Delete (Invoiced)" : isDeleting ? "Deleting..." : "Delete PO"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}