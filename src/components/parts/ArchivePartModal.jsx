import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";
import { Archive, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ARCHIVE_CONTEXT_OPTIONS } from "./partTypeBehavior";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * ArchivePartModal
 * Modal for archiving a part with reason and context
 */
export default function ArchivePartModal({
  isOpen,
  onClose,
  part,
  onSuccess,
}) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    context: "",
    reason: "",
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      // Update the part
      await base44.entities.Part.update(part.id, {
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: user?.id,
        archived_context: formData.context,
        archive_reason: formData.reason,
      });

      // Create audit log
      await base44.entities.InventoryAuditLog.create({
        part_id: part.id,
        action_type: "archive",
        old_value: "active",
        new_value: "archived",
        notes: `Context: ${formData.context}. ${formData.reason}`,
        performed_by: user?.id,
        performed_at: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: [part.id],
      });
      onSuccess?.();
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.context) return;
    archiveMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "bg-gray-900 border-gray-700 max-w-md",
          isMobile && "fixed bottom-0 left-0 right-0 top-auto translate-y-0 rounded-t-2xl rounded-b-none max-w-full mx-0"
        )}
        style={isMobile ? { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Archive Part
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Archived parts are hidden from lists but preserved for history.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Part Info */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-white font-medium">{part?.part_name}</p>
            {part?.vendor_part_number && (
              <p className="text-sm text-gray-400">SKU: {part.vendor_part_number}</p>
            )}
          </div>

          {/* Warning */}
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              <p className="font-medium mb-1">This part will be:</p>
              <ul className="list-disc list-inside text-amber-300/80 space-y-0.5">
                <li>Hidden from default part lists</li>
                <li>Unable to be ordered</li>
                <li>Unable to receive new inventory</li>
                <li>Still visible in reports and history</li>
              </ul>
            </div>
          </div>

          {/* Archive Context */}
          <div className="space-y-2">
            <Label className="text-gray-300">Archive Reason *</Label>
            <Select
              value={formData.context}
              onValueChange={(value) => setFormData({ ...formData, context: value })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                {ARCHIVE_CONTEXT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label className="text-gray-300">Additional Notes</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Optional details..."
              className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
            />
          </div>
        </form>

        <DialogFooter className={cn(isMobile && "flex-col-reverse gap-2")}>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={archiveMutation.isPending}
            className={cn("border-gray-700", isMobile && "w-full h-11")}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={archiveMutation.isPending || !formData.context}
            className={cn("bg-amber-600 hover:bg-amber-700 text-white", isMobile && "w-full h-11")}
          >
            {archiveMutation.isPending ? "Archiving..." : "Archive Part"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}