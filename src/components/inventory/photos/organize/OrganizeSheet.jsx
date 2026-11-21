import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/** Single-level dialog shell shared by organizing actions: title, body, one confirm button. */
export default function OrganizeSheet({ title, description, busy, confirmLabel, confirmDisabled, onConfirm, onClose, children }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-gray-950 border-gray-800 text-gray-100">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-gray-400">{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        {onConfirm && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={busy} className="flex-1 h-11">Cancel</Button>
            <Button onClick={onConfirm} disabled={busy || confirmDisabled} className="flex-1 h-11 gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}