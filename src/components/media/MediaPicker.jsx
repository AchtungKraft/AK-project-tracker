import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Image, Check, X, FolderOpen, ChevronRight, Home } from "lucide-react";
import { searchAssets, filterByStatus, extractFolders, getAssetsInFolder } from "./mediaHelpers";

/**
 * MediaPicker — Reusable component for selecting media assets.
 * 
 * Returns: { publicUrl, fileName, relativePath, mediaAssetId }
 * 
 * Usage:
 *   <MediaPicker
 *     open={showPicker}
 *     onClose={() => setShowPicker(false)}
 *     onSelect={({ publicUrl, fileName, relativePath, mediaAssetId }) => { ... }}
 *     multiple={false}
 *   />
 */
export default function MediaPicker({ open, onClose, onSelect, multiple = false, title = "Select Image" }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [selected, setSelected] = useState(multiple ? [] : null);

  const { data: allAssets = [], isLoading } = useQuery({
    queryKey: ['mediaAssets'],
    queryFn: () => base44.entities.MediaAsset.list('-created_date', 500),
    enabled: open,
  });

  const activeAssets = useMemo(() => filterByStatus(allAssets, 'active'), [allAssets]);

  const filtered = useMemo(() => {
    if (searchTerm) return searchAssets(activeAssets, searchTerm);
    return activeAssets;
  }, [activeAssets, searchTerm]);

  const folders = useMemo(() => extractFolders(filtered, currentPath), [filtered, currentPath]);
  const folderAssets = useMemo(() => {
    if (searchTerm) return filtered;
    return getAssetsInFolder(filtered, currentPath);
  }, [filtered, currentPath, searchTerm]);

  const isSelected = (asset) => {
    if (multiple) return selected.some(s => s.id === asset.id);
    return selected?.id === asset.id;
  };

  const toggleSelect = (asset) => {
    if (multiple) {
      setSelected(prev =>
        prev.some(s => s.id === asset.id)
          ? prev.filter(s => s.id !== asset.id)
          : [...prev, asset]
      );
    } else {
      setSelected(asset);
    }
  };

  const handleConfirm = () => {
    if (multiple) {
      const results = selected.map(a => ({
        publicUrl: a.public_url || a.file_url,
        fileName: a.file_name,
        relativePath: a.full_relative_path || '',
        mediaAssetId: a.id,
      }));
      onSelect(results);
    } else if (selected) {
      onSelect({
        publicUrl: selected.public_url || selected.file_url,
        fileName: selected.file_name,
        relativePath: selected.full_relative_path || '',
        mediaAssetId: selected.id,
      });
    }
    setSelected(multiple ? [] : null);
    setSearchTerm('');
    setCurrentPath('');
    onClose();
  };

  const handleClose = () => {
    setSelected(multiple ? [] : null);
    setSearchTerm('');
    setCurrentPath('');
    onClose();
  };

  const pathParts = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search images..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-gray-800 border-gray-600 text-white"
          />
        </div>

        {/* Breadcrumbs */}
        {!searchTerm && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <button onClick={() => setCurrentPath('')} className="flex items-center gap-1 hover:text-purple-400">
              <Home className="w-3 h-3" /> Root
            </button>
            {pathParts.map((part, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight className="w-3 h-3 text-gray-600" />
                <button
                  onClick={() => setCurrentPath(pathParts.slice(0, idx + 1).join('/'))}
                  className={idx === pathParts.length - 1 ? 'text-purple-400' : 'hover:text-purple-400'}
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: '45vh' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Folders */}
              {!searchTerm && folders.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {folders.map(folder => (
                    <button
                      key={folder}
                      onClick={() => setCurrentPath(currentPath ? `${currentPath}/${folder}` : folder)}
                      className="flex items-center gap-2 p-2 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white"
                    >
                      <FolderOpen className="w-4 h-4 text-yellow-500/80 flex-shrink-0" />
                      <span className="truncate">{folder}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Images */}
              {folderAssets.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {folderAssets.map(asset => (
                    <button
                      key={asset.id}
                      onClick={() => toggleSelect(asset)}
                      className={`relative aspect-square bg-gray-800/50 border rounded-lg overflow-hidden transition-all ${
                        isSelected(asset) ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <img
                        src={asset.public_url || asset.file_url}
                        alt={asset.file_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      {isSelected(asset) && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                        <p className="text-[9px] text-gray-300 truncate">{asset.file_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                !isLoading && folders.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Image className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No images found</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-gray-800 pt-3">
          <div className="flex-1 text-xs text-gray-400">
            {multiple
              ? `${selected.length} selected`
              : selected ? selected.file_name : 'No selection'}
          </div>
          <Button variant="outline" onClick={handleClose} className="border-gray-600">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={multiple ? selected.length === 0 : !selected}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {multiple ? `Select (${selected.length})` : 'Select'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}