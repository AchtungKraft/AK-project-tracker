import React, { useState } from "react";
import { MoreHorizontal, Clock, Archive, Play, CheckCircle2, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Compact action overflow menu for Action Queue cards.
 * Executes operational actions directly without navigation.
 */
export default function AttentionCardActions({ item, onAction }) {
  const [open, setOpen] = useState(false);
  const { request, type } = item;
  const isDraft = type === 'needs_sending';
  const isInReview = request.review_state === 'in_review';
  const isHidden = request.queue_hidden;

  const handleAction = (action, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setOpen(false);
    onAction(action, request);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); }}
          className="p-1 rounded-md hover:bg-gray-700/60 transition-colors text-gray-500 hover:text-gray-300"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-gray-900 border-gray-700">
        {/* Finish Review — only when in_review */}
        {isInReview && (
          <DropdownMenuItem
            onClick={(e) => handleAction('finish_review', e)}
            className="text-blue-400 focus:text-blue-300 gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            Finish Review
          </DropdownMenuItem>
        )}

        {/* Start Review — non-draft, non-archived, not already reviewing */}
        {!isDraft && !isInReview && (
          <DropdownMenuItem
            onClick={(e) => handleAction('start_review', e)}
            className="text-blue-400 focus:text-blue-300 gap-2 cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            Start Review
          </DropdownMenuItem>
        )}

        {/* Remove from Queue / Resume — non-draft only */}
        {!isDraft && (
          <>
            <DropdownMenuSeparator className="bg-gray-700/50" />
            {isHidden ? (
              <DropdownMenuItem
                onClick={(e) => handleAction('resume', e)}
                className="text-green-400 focus:text-green-300 gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Resume in Queue
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={(e) => handleAction('remove_from_queue', e)}
                className="text-gray-300 focus:text-white gap-2 cursor-pointer"
              >
                <Clock className="w-4 h-4" />
                Later
              </DropdownMenuItem>
            )}
          </>
        )}

        {/* Archive Draft — drafts only */}
        {isDraft && (
          <>
            <DropdownMenuSeparator className="bg-gray-700/50" />
            <DropdownMenuItem
              onClick={(e) => handleAction('archive_draft', e)}
              className="text-gray-400 focus:text-gray-300 gap-2 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              Archive Draft
            </DropdownMenuItem>
          </>
        )}

        {/* Archive — non-draft posted items */}
        {!isDraft && (
          <DropdownMenuItem
            onClick={(e) => handleAction('archive', e)}
            className="text-gray-400 focus:text-gray-300 gap-2 cursor-pointer"
          >
            <Archive className="w-4 h-4" />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}