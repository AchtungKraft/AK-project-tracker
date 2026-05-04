import React from "react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import { Plus, Type, Image, Link2, FileText, MousePointer } from "lucide-react";

const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: Type, desc: 'Rich text content' },
  { type: 'media', label: 'Media', icon: Image, desc: 'Images or video' },
  { type: 'links', label: 'Links', icon: Link2, desc: 'Link list' },
  { type: 'files', label: 'Files', icon: FileText, desc: 'Downloadable files' },
  { type: 'cta', label: 'CTA', icon: MousePointer, desc: 'Call to action button' },
];

export default function AddBlockPopover({ onAdd }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed border-gray-600 text-gray-400 gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Block
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-gray-900 border-gray-700 w-48 p-1">
        {BLOCK_TYPES.map(bt => (
          <button
            key={bt.type}
            onClick={() => onAdd(bt.type)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded transition-colors"
          >
            <bt.icon className="w-4 h-4 text-gray-500" />
            <div className="text-left">
              <p className="font-medium text-xs">{bt.label}</p>
            </div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}