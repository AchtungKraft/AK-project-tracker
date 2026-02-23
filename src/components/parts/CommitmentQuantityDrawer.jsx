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
  // Don't render if no commitment
  if (!commitment) {
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
          part={part}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  );
}