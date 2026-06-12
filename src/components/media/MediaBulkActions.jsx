import React from "react";
import { Button } from "@/components/ui/button";
import { Archive, Copy, FolderInput, X } from "lucide-react";
import { toast } from "sonner";

/**
 * MediaBulkActions — Floating bar for multi-select operations
 */
export default function MediaBulkActions({ selectedIds, allAssets, onClearSelection, onBulkArchive, onBulkMove }) {
  if (selectedIds.size === 0) return null;

  const selectedAssets = allAssets.filter(a => selectedIds.has(a.id));

  const handleCopyUrls = () => {
    const urls = selectedAssets.map(a => a.public_url || a.file_url).join('\n');
    navigator.clipboard.writeText(urls);
    toast.success(`${selectedAssets.length} URL(s) copied`);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-purple-600/50 rounded-xl shadow-2xl shadow-purple-900/30 px-4 py-3 flex items-center gap-3">
      <span className="text-sm text-purple-300 font-medium whitespace-nowrap">
        {selectedIds.size} selected
      </span>
      <div className="w-px h-6 bg-gray-700" />
      <Button onClick={handleCopyUrls} variant="outline" size="sm" className="border-gray-600 gap-1.5 text-xs">
        <Copy className="w-3.5 h-3.5" /> Copy URLs
      </Button>
      <Button onClick={onBulkArchive} variant="outline" size="sm" className="border-red-700 text-red-400 gap-1.5 text-xs">
        <Archive className="w-3.5 h-3.5" /> Archive
      </Button>
      <Button onClick={onBulkMove} variant="outline" size="sm" className="border-blue-700 text-blue-400 gap-1.5 text-xs">
        <FolderInput className="w-3.5 h-3.5" /> Move
      </Button>
      <button onClick={onClearSelection} className="text-gray-400 hover:text-white ml-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}