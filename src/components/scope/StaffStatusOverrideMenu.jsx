import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, CheckCircle2, Clock, MessageSquare, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DECISION_LABELS } from "./scopeHelpers";

const STATUS_OPTIONS = [
  { value: "needs_review", label: "Needs Review", icon: Clock, color: "text-amber-400" },
  { value: "approved", label: "Approved", icon: CheckCircle2, color: "text-green-400" },
  { value: "request_changes", label: "Request Changes", icon: MessageSquare, color: "text-orange-400" },
  { value: "not_now", label: "Not Now", icon: XCircle, color: "text-gray-400" },
];

/**
 * Staff-only dropdown to override any scope item's decision status.
 * Renders a ⋮ menu button. After selecting a status, shows an inline note form
 * below (not replacing the button) so the dropdown can close naturally.
 */
export default function StaffStatusOverrideMenu({
  item,
  onStatusChange,
  onRequireReapproval,
  onEdit,
}) {
  const [pendingStatus, setPendingStatus] = useState(null); // null | status string | "__reapproval"
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const current = item.decision_status || "needs_review";
  const availableStatuses = STATUS_OPTIONS.filter(s => s.value !== current);

  const handleConfirm = async () => {
    setLoading(true);
    if (pendingStatus === "__reapproval") {
      await onRequireReapproval?.(item.id, note.trim() || null);
    } else {
      await onStatusChange?.(item.id, pendingStatus, note.trim() || null);
    }
    setLoading(false);
    setPendingStatus(null);
    setNote("");
  };

  const handleCancel = () => {
    setPendingStatus(null);
    setNote("");
  };

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-white">
            <MoreVertical className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-gray-900 border-gray-700">
          {onEdit && (
            <>
              <DropdownMenuItem onClick={() => onEdit(item)} className="text-xs text-gray-300 hover:text-white">
                Edit Item
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-700/50" />
            </>
          )}

          <div className="px-2 py-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Change Status</span>
          </div>
          {availableStatuses.map(opt => {
            const Icon = opt.icon;
            return (
              <DropdownMenuItem key={opt.value} onClick={() => { setPendingStatus(opt.value); setNote(""); }}
                className="text-xs text-gray-300 hover:text-white gap-2">
                <Icon className={cn("w-3.5 h-3.5", opt.color)} />
                {opt.label}
              </DropdownMenuItem>
            );
          })}

          {current !== "reapproval_required" && (
            <>
              <DropdownMenuSeparator className="bg-gray-700/50" />
              <DropdownMenuItem onClick={() => { setPendingStatus("__reapproval"); setNote(""); }}
                className="text-xs text-red-400 hover:text-red-300 gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Require Reapproval
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inline note form — renders below the menu trigger after selection */}
      {pendingStatus && (
        <div className="mt-2 p-2.5 bg-gray-800/80 rounded-lg border border-gray-700/60 space-y-2"
          data-staff-note-form="true">
          <p className="text-xs text-gray-400">
            Change to{' '}
            <span className="text-white font-medium">
              {pendingStatus === "__reapproval" ? "Reapproval Required" : DECISION_LABELS[pendingStatus]}
            </span>
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal reason (optional)..."
            className="bg-gray-900 border-gray-700 text-white text-xs min-h-[36px] resize-none"
            rows={1}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleConfirm} disabled={loading}
              className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white gap-1">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}
              className="h-7 text-xs text-gray-400 hover:text-white">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}