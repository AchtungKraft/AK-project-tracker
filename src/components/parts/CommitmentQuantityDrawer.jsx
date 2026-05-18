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
  // Guard: commitment must be canonical. Let Sheet still render so open/onClose stay wired.
  const isValid = commitment && commitment.required_total !== undefined;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose?.()}>
      <SheetContent className="bg-gray-900 border-gray-700 w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-white">Manage Quantity</SheetTitle>
          <SheetDescription>
            Adjust, move, or split this project requirement
          </SheetDescription>
        </SheetHeader>

        {isValid ? (
          <CommitmentQuantityManager
            commitment={commitment}
            part={part || commitment.part}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}