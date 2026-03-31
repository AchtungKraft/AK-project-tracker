import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * DeleteServiceConfirmModal — Confirmation dialog before deleting a ServiceCommitment.
 *
 * Props:
 *  - commitment: the ServiceCommitment record
 *  - open / onClose / onSuccess
 */
export default function DeleteServiceConfirmModal({ commitment, open, onClose, onSuccess }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "DELETE",
        commitment_id: commitment.id,
      });
      toast.success("Service commitment deleted");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Delete failed: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="bg-gray-900 border-gray-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Delete Service Commitment?</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            This will permanently delete <span className="text-white font-medium">"{commitment.description}"</span> and
            all associated line items. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-gray-600 text-gray-300" disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}