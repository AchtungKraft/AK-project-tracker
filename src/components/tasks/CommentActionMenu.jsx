import React from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function CommentActionMenu({ onEdit, onDelete }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 min-w-[28px] min-h-[28px] text-gray-500 hover:text-white hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity md:opacity-0 max-md:opacity-100"
          aria-label="Comment actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700 min-w-[140px]">
        <DropdownMenuItem
          onClick={onEdit}
          className="text-gray-200 focus:bg-gray-800 focus:text-white cursor-pointer gap-2"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit Comment
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="text-red-400 focus:bg-red-950/50 focus:text-red-300 cursor-pointer gap-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Comment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}