import React from "react";
import { Copy, ExternalLink, Image, Check } from "lucide-react";
import { toast } from "sonner";

export default function MediaGridView({ assets, onSelectAsset, onReplace, onArchive, selectedIds, onToggleSelect }) {
  const copyUrl = (e, asset) => {
    e.stopPropagation();
    navigator.clipboard.writeText(asset.public_url || asset.file_url);
    toast.success('URL copied');
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {assets.map(asset => {
        const isSelected = selectedIds?.has(asset.id);
        return (
        <div
          key={asset.id}
          onClick={() => onSelectAsset(asset)}
          className={`group relative bg-gray-800/50 hover:bg-gray-800 border rounded-lg overflow-hidden transition-all cursor-pointer ${
            isSelected ? 'border-purple-500 ring-1 ring-purple-500/30' : 'border-gray-700 hover:border-purple-600/50'
          }`}
        >
          {/* Select checkbox */}
          {onToggleSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(asset.id); }}
              className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                isSelected ? 'bg-purple-600 border-purple-500' : 'bg-black/50 border-gray-500 opacity-0 group-hover:opacity-100'
              }`}
            >
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </button>
          )}
          <div className="aspect-square bg-gray-900/50 flex items-center justify-center overflow-hidden relative">
            <img
              src={asset.public_url || asset.file_url}
              alt={asset.file_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="hidden items-center justify-center absolute inset-0 bg-gray-900">
              <Image className="w-8 h-8 text-gray-600" />
            </div>
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button onClick={(e) => copyUrl(e, asset)} className="p-2 bg-gray-700/80 rounded-lg hover:bg-gray-600" title="Copy URL">
                <Copy className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); window.open(asset.public_url || asset.file_url, '_blank'); }}
                className="p-2 bg-gray-700/80 rounded-lg hover:bg-gray-600" title="Open"
              >
                <ExternalLink className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          <div className="p-2">
            <p className="text-xs text-gray-300 truncate">{asset.file_name || asset.title || 'Untitled'}</p>
            <p className="text-[10px] text-gray-500 truncate">
              {asset.folder_path || '/'} 
              {asset.file_size ? ` • ${formatSize(asset.file_size)}` : ''}
            </p>
          </div>
          {asset.archived && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-900/80 text-red-300 text-[9px] rounded font-medium">
              ARCHIVED
            </div>
          )}
          {asset.status === 'superseded' && !asset.archived && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-yellow-900/80 text-yellow-300 text-[9px] rounded font-medium">
              SUPERSEDED
            </div>
          )}
          {(asset.version || 0) > 1 && (
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-blue-900/80 text-blue-300 text-[9px] rounded font-medium">
              v{asset.version}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}