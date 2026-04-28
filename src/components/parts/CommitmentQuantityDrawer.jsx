import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import CommitmentQuantityManager from "./CommitmentQuantityManager";

/**
 * Drawer wrapper for CommitmentQuantityManager
 * Can be opened from Lifecycle Timeline, Action Workbench, or Project Parts view
 */
export default function CommitmentQuantityDrawer({ 
  open, 
  onClose, 
  commitment, 
  part,
  onSuccess 
}) {
  // Guard: don't render anything if commitment lacks required canonical fields
  // Callers like ReceivingGapDiagnosticsPanel pass minimal objects without required_total
  if (!commitment || commitment.required_total === undefined) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose?.()}>
      <SheetContent className="bg-gray-900 border-gray-700 w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-white">Manage Commitment Quantity</SheetTitle>
          <SheetDescription>
            Adjust quantities, move between projects, or split commitments
          </SheetDescription>
        </SheetHeader>

        <CommitmentQuantityManager
          commitment={commitment}
          part={part || commitment.part}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  );
}