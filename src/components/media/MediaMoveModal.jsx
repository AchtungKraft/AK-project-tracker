import React, { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, ChevronRight, Home, FolderInput, Loader2 } from "lucide-react";
import { extractFolders } from "./mediaHelpers";

/**
 * Move Index Record — updates folder_path metadata only.
 * Does NOT move physical files in Base44 storage.
 */
export default function MediaMoveModal({ open, onClose, assets, allAssets, onConfirm, isLoading }) {
  const [targetPath, setTargetPath] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Build folder tree from all assets
  const allFolders = useMemo(() => {
    const folders = new Set();
    allAssets.forEach(a => {
      if (a.folder_path) {
        const parts = a.folder_path.split('/');
        for (let i = 0; i < parts.length; i++) {
          folders.add(parts.slice(0, i + 1).join('/'));
        }
      }
    });
    return Array.from(folders).sort();
  }, [allAssets]);

  const handleConfirm = () => {
    const finalPath = newFolderName.trim()
      ? (targetPath ? `${targetPath}/${newFolderName.trim()}` : newFolderName.trim())
      : targetPath;
    onConfirm(finalPath);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FolderInput className="w-5 h-5 text-blue-400" />
            Move Index Record{assets.length > 1 ? 's' : ''} ({assets.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current selection info */}
          <div className="text-sm text-gray-400">
            {assets.length === 1
              ? <span>Moving <span className="text-purple-400">{assets[0].file_name}</span></span>
              : <span>Moving {assets.length} files</span>
            }
          </div>

          {/* Target folder */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Target Indexed Path</label>
            <button
              onClick={() => setTargetPath('')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                targetPath === '' ? 'bg-purple-900/30 border border-purple-600/50 text-purple-300' : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <Home className="w-4 h-4" /> / (root)
            </button>
            <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
              {allFolders.map(folder => (
                <button
                  key={folder}
                  onClick={() => setTargetPath(folder)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                    targetPath === folder ? 'bg-purple-900/30 border border-purple-600/50 text-purple-300' : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <FolderOpen className="w-4 h-4 text-yellow-500/80 flex-shrink-0" />
                  <span className="truncate">{folder}</span>
                </button>
              ))}
            </div>
          </div>

          {/* New subfolder */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Or create new subfolder</label>
            <Input
              placeholder="New folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ''))}
              className="bg-gray-800 border-gray-600 text-white"
            />
            {newFolderName && (
              <p className="text-xs text-gray-500 mt-1">
                Will move to: <span className="text-purple-400 font-mono">
                  {targetPath ? `${targetPath}/${newFolderName}` : newFolderName}
                </span>
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}