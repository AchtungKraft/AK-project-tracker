import React from "react";
import { Folder } from "lucide-react";

export default function MediaFolderView({ folders, assets, currentPath, onNavigateFolder, onSelectAsset }) {
  return (
    <div className="space-y-4">
      {/* Folders */}
      {folders.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 px-1">Folders ({folders.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {folders.map(folder => (
              <button
                key={folder}
                onClick={() => onNavigateFolder(currentPath ? `${currentPath}/${folder}` : folder)}
                className="flex flex-col items-center gap-2 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-purple-600/50 rounded-lg transition-colors group"
              >
                <Folder className="w-10 h-10 text-yellow-500/80 group-hover:text-yellow-400 transition-colors" />
                <span className="text-sm text-gray-300 group-hover:text-white text-center truncate w-full">
                  {folder}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Images */}
      {assets.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 px-1">Files ({assets.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {assets.map(asset => (
              <button
                key={asset.id}
                onClick={() => onSelectAsset(asset)}
                className="group relative bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-purple-600/50 rounded-lg overflow-hidden transition-all"
              >
                <div className="aspect-square bg-gray-900/50 flex items-center justify-center overflow-hidden">
                  <img
                    src={asset.public_url || asset.file_url}
                    alt={asset.file_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-300 truncate">{asset.file_name || asset.title || 'Untitled'}</p>
                  {asset.file_size && (
                    <p className="text-[10px] text-gray-500">{formatFileSize(asset.file_size)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {folders.length === 0 && assets.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Folder className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>This folder is empty</p>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}