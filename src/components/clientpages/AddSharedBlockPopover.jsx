import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import { Share2, Search } from "lucide-react";

export default function AddSharedBlockPopover({ sharedBlocks = [], onAdd }) {
  const [search, setSearch] = useState('');

  const filtered = sharedBlocks.filter(sb =>
    !search || sb.name.toLowerCase().includes(search.toLowerCase()) ||
    (sb.category && sb.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed border-blue-600/50 text-blue-400 gap-1">
          <Share2 className="w-3.5 h-3.5" /> Add Shared Block
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-gray-900 border-gray-700 w-72 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search blocks..."
            className="bg-gray-800 border-gray-700 text-white h-8 text-xs pl-7" />
        </div>
        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">No shared blocks found</p>
          ) : filtered.map(sb => (
            <button
              key={sb.id}
              onClick={() => onAdd(sb)}
              className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-xs truncate">{sb.name}</p>
                <div className="flex gap-1 mt-0.5">
                  <Badge variant="outline" className="border-gray-600 text-gray-500 text-[9px] px-1">{sb.type}</Badge>
                  {sb.category && (
                    <Badge variant="outline" className="border-gray-600 text-gray-500 text-[9px] px-1">{sb.category}</Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}