import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Archive,
  Trash2,
  Loader2,
  RotateCw,
  FileText,
  Clock,
  Play,
  Eye,
  EyeOff,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isQueueHidden } from "./attentionHelpers";

/**
 * Hierarchical action bar for the Detail page.
 * 
 * Primary: The one main workflow action (Post, Resend, Move to Draft)
 * Secondary: Review toggle (Start/Stop Reviewing)
 * Overflow: Low-frequency ops (Later, Archive, Delete)
 */
export default function DetailActionBar({
  canonicalState,
  request,
  isMobile,
  isDeleting,
  onPostToClient,
  onResend,
  onArchive,
  onDelete,
  onStartReviewing,
  onStopReviewing,
  onShowLaterModal,
  onResumeInQueue,
  onMoveToDraft,
}) {
  if (!canonicalState || !request) return null;

  const key = canonicalState.key;
  const isReviewing = request.review_state === 'in_review';
  const hidden = isQueueHidden(request);
  const isActive = ['awaiting_review', 'changes_requested', 'approved'].includes(key);

  // --- Primary Action ---
  let primaryAction = null;
  if (key === 'draft') {
    primaryAction = (
      <Button size="sm" onClick={onPostToClient} className={cn("bg-blue-600 hover:bg-blue-700 text-white", isMobile && "flex-1 h-10")}>
        Post to Client
      </Button>
    );
  } else if (isActive) {
    primaryAction = (
      <Button size="sm" onClick={onResend} className={cn("bg-blue-600 hover:bg-blue-700 text-white", isMobile && "flex-1 h-10")}>
        <RotateCw className="w-4 h-4 mr-1" />
        Resend
      </Button>
    );
  } else if (key === 'archived') {
    primaryAction = (
      <Button size="sm" onClick={onMoveToDraft} variant="outline" className={cn("border-gray-600 text-gray-200 hover:bg-gray-700", isMobile && "flex-1 h-10")}>
        <FileText className="w-4 h-4 mr-1" />
        Move to Draft
      </Button>
    );
  }

  // --- Secondary Action (Review toggle) ---
  let secondaryAction = null;
  if (key !== 'draft' && key !== 'archived') {
    if (isReviewing) {
      secondaryAction = (
        <Button
          size="sm"
          variant="outline"
          onClick={onStopReviewing}
          className={cn(
            "border-blue-500/50 text-blue-400 hover:bg-blue-500/10",
            isMobile ? "flex-1 h-10" : "h-8 text-xs"
          )}
        >
          <Square className="w-3.5 h-3.5 mr-1" />
          Stop Reviewing
        </Button>
      );
    } else if (key !== 'approved') {
      secondaryAction = (
        <Button
          size="sm"
          variant="outline"
          onClick={onStartReviewing}
          className={cn(
            "border-blue-500/50 text-blue-400 hover:bg-blue-500/10",
            isMobile ? "flex-1 h-10" : "h-8 text-xs"
          )}
        >
          <Eye className="w-3.5 h-3.5 mr-1" />
          Start Reviewing
        </Button>
      );
    }
  }

  // --- Overflow Menu items ---
  const overflowItems = [];

  // Later / Resume
  if (key !== 'draft' && key !== 'archived') {
    if (hidden) {
      overflowItems.push({ label: "Resume in Queue", icon: Play, onClick: onResumeInQueue, className: "text-green-400 focus:text-green-300" });
    } else {
      overflowItems.push({ label: "Defer", icon: Clock, onClick: onShowLaterModal, className: "text-gray-300 focus:text-white" });
    }
  }

  // Archive
  if (key === 'draft' || isActive) {
    overflowItems.push({ label: "Archive", icon: Archive, onClick: onArchive, className: "text-gray-400 focus:text-gray-300" });
  }

  // Delete — always last, separated
  overflowItems.push({ label: "Delete", icon: Trash2, onClick: onDelete, className: "text-red-400 focus:text-red-300", destructive: true, loading: isDeleting });

  if (isMobile) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          {primaryAction}
          {secondaryAction}
        </div>
        {overflowItems.length > 0 && (
          <div className="flex items-center justify-end">
            <OverflowMenu items={overflowItems} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {primaryAction}
      {secondaryAction}
      {overflowItems.length > 0 && (
        <OverflowMenu items={overflowItems} />
      )}
    </div>
  );
}

function OverflowMenu({ items }) {
  const hasDestructive = items.some(i => i.destructive);
  const regular = items.filter(i => !i.destructive);
  const destructive = items.filter(i => i.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-gray-600 text-gray-400 hover:text-white">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-gray-900 border-gray-700">
        {regular.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              className={cn("gap-2 cursor-pointer", item.className)}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </DropdownMenuItem>
          );
        })}
        {hasDestructive && <DropdownMenuSeparator className="bg-gray-700/50" />}
        {destructive.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              disabled={item.loading}
              className={cn("gap-2 cursor-pointer", item.className)}
            >
              {item.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}