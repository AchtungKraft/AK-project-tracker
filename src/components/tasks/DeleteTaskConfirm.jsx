import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";

/**
 * DeleteTaskConfirm
 * Confirmation dialog for deleting a task
 * Mobile: Bottom sheet style
 * Desktop: Centered modal
 */
export default function DeleteTaskConfirm({ 
  isOpen, 
  onClose, 
  onConfirm, 
  taskName,
  isLoading = false,
}) {
  const isMobile = useIsMobile();

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent 
        className={cn(
          "bg-gray-900 border-gray-700",
          isMobile && "fixed bottom-0 left-0 right-0 top-auto translate-y-0 rounded-t-2xl rounded-b-none max-w-full mx-0 data-[state=open]:slide-in-from-bottom"
        )}
        style={isMobile ? { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Delete Task?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            Delete "{taskName}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={cn(isMobile && "flex-col-reverse gap-2")}>
          <AlertDialogCancel 
            className={cn(
              "border-gray-700 text-white hover:bg-gray-800",
              isMobile && "w-full h-11 mt-0"
            )}
            disabled={isLoading}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "bg-red-600 hover:bg-red-700 text-white",
              isMobile && "w-full h-11"
            )}
          >
            {isLoading ? 'Deleting...' : 'Delete Task'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}