import React, { useState } from "react";
import { MoreHorizontal, Clock, Archive, Play, Square, Eye, Send, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * State-specific action overflow menu for Action Queue cards.
 * Only displays actions valid for the current request state.
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

        {/* === DRAFT state === */}
        {isDraft && (
          <>
            <DropdownMenuItem
              onClick={(e) => handleAction('post_to_client', e)}
              className="text-blue-400 focus:text-blue-300 gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Post to Client
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700/50" />
            <DropdownMenuItem
              onClick={(e) => handleAction('archive_draft', e)}
              className="text-gray-400 focus:text-gray-300 gap-2 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              Archive Draft
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => handleAction('remove_from_queue', e)}
              className="text-gray-300 focus:text-white gap-2 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              Later
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700/50" />
            <DropdownMenuItem
              onClick={(e) => handleAction('delete', e)}
              className="text-red-400 focus:text-red-300 gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}

        {/* === WAITING (client waiting / needs_response) === */}
        {!isDraft && !isInReview && !isHidden && (
          <>
            <DropdownMenuItem
              onClick={(e) => handleAction('start_review', e)}
              className="text-blue-400 focus:text-blue-300 gap-2 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Start Reviewing
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700/50" />
            <DropdownMenuItem
              onClick={(e) => handleAction('remove_from_queue', e)}
              className="text-gray-300 focus:text-white gap-2 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              Later
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => handleAction('archive', e)}
              className="text-gray-400 focus:text-gray-300 gap-2 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              Archive
            </DropdownMenuItem>
          </>
        )}

        {/* === IN REVIEW === */}
        {!isDraft && isInReview && !isHidden && (
          <>
            <DropdownMenuItem
              onClick={(e) => handleAction('finish_review', e)}
              className="text-blue-400 focus:text-blue-300 gap-2 cursor-pointer"
            >
              <Square className="w-4 h-4" />
              Stop Reviewing
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700/50" />
            <DropdownMenuItem
              onClick={(e) => handleAction('remove_from_queue', e)}
              className="text-gray-300 focus:text-white gap-2 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              Later
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => handleAction('archive', e)}
              className="text-gray-400 focus:text-gray-300 gap-2 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              Archive
            </DropdownMenuItem>
          </>
        )}

        {/* === HIDDEN (queue_hidden) === */}
        {!isDraft && isHidden && (
          <>
            <DropdownMenuItem
              onClick={(e) => handleAction('resume', e)}
              className="text-green-400 focus:text-green-300 gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Resume in Queue
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700/50" />
            <DropdownMenuItem
              onClick={(e) => handleAction('archive', e)}
              className="text-gray-400 focus:text-gray-300 gap-2 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              Archive
            </DropdownMenuItem>
          </>
        )}

      </DropdownMenuContent>
    </DropdownMenu>
  );
}