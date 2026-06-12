import React from "react";
import { Copy, ExternalLink, Image } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import moment from "moment";

export default function MediaListView({ assets, onSelectAsset }) {
  return (
    <div className="bg-gray-800/30 border border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-left">
            <th className="px-3 py-2 text-gray-400 font-medium text-xs w-10"></th>
            <th className="px-3 py-2 text-gray-400 font-medium text-xs">Filename</th>
            <th className="px-3 py-2 text-gray-400 font-medium text-xs hidden md:table-cell">Folder</th>
            <th className="px-3 py-2 text-gray-400 font-medium text-xs hidden lg:table-cell">Dimensions</th>
            <th className="px-3 py-2 text-gray-400 font-medium text-xs hidden sm:table-cell">Size</th>
            <th className="px-3 py-2 text-gray-400 font-medium text-xs hidden md:table-cell">Modified</th>
            <th className="px-3 py-2 text-gray-400 font-medium text-xs w-20">Actions</th>
          </tr>
        </thead>
        <tbody>
          {assets.map(asset => (
            <tr
              key={asset.id}
              onClick={() => onSelectAsset(asset)}
              className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2">
                <div className="w-8 h-8 bg-gray-900 rounded overflow-hidden flex-shrink-0">
                  <img
                    src={asset.public_url || asset.file_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-200 truncate max-w-[200px]">{asset.file_name || asset.title}</span>
                  {asset.archived && <Badge className="bg-red-900/50 text-red-300 text-[9px]">Archived</Badge>}
                  {(asset.version || 0) > 1 && <Badge className="bg-blue-900/50 text-blue-300 text-[9px]">v{asset.version}</Badge>}
                </div>
              </td>
              <td className="px-3 py-2 text-gray-400 truncate max-w-[150px] hidden md:table-cell">
                {asset.folder_path || '/'}
              </td>
              <td className="px-3 py-2 text-gray-400 hidden lg:table-cell">
                {asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'}
              </td>
              <td className="px-3 py-2 text-gray-400 hidden sm:table-cell">
                {asset.file_size ? formatSize(asset.file_size) : '—'}
              </td>
              <td className="px-3 py-2 text-gray-400 hidden md:table-cell">
                {asset.updated_date ? moment(asset.updated_date).format('MMM D, YYYY') : '—'}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(asset.public_url || asset.file_url);
                      toast.success('URL copied');
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(asset.public_url || asset.file_url, '_blank');
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}