import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Download, Replace, Archive, ArchiveRestore, X } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

export default function MediaViewer({ asset, open, onClose, onReplace, onArchive, onUnarchive }) {
  if (!asset) return null;

  const url = asset.public_url || asset.file_url;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.file_name || 'download';
    a.target = '_blank';
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            {asset.file_name || asset.title}
            {(asset.version || 0) > 1 && (
              <Badge className="bg-blue-900/50 text-blue-300 text-xs">v{asset.version}</Badge>
            )}
            {asset.archived && (
              <Badge className="bg-red-900/50 text-red-300 text-xs">Archived</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Preview */}
          <div className="bg-gray-950 rounded-lg border border-gray-800 flex items-center justify-center overflow-hidden" style={{ maxHeight: '50vh' }}>
            <img
              src={url + '?t=' + Date.now()}
              alt={asset.file_name}
              className="max-w-full max-h-[50vh] object-contain"
            />
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <MetaField label="Filename" value={asset.file_name} />
            <MetaField label="Folder Path" value={asset.folder_path || '/'} />
            <MetaField label="Relative Path" value={asset.full_relative_path} />
            <MetaField label="Dimensions" value={asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'} />
            <MetaField label="File Size" value={asset.file_size ? formatSize(asset.file_size) : '—'} />
            <MetaField label="MIME Type" value={asset.mime_type || '—'} />
            <MetaField label="Version" value={asset.version || 1} />
            <MetaField label="Created" value={asset.created_date ? moment(asset.created_date).format('MMM D, YYYY h:mm A') : '—'} />
            <MetaField label="Modified" value={asset.updated_date ? moment(asset.updated_date).format('MMM D, YYYY h:mm A') : '—'} />
            {asset.replaced_at && <MetaField label="Last Replaced" value={moment(asset.replaced_at).format('MMM D, YYYY h:mm A')} />}
            {asset.source_context && <MetaField label="Source" value={asset.source_context} />}
          </div>

          {/* URL */}
          <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Public URL</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs text-purple-300 flex-1 break-all">{url}</code>
              <Button onClick={handleCopy} variant="ghost" size="icon" className="flex-shrink-0 h-7 w-7">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Notes */}
          {asset.notes && (
            <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Notes</label>
              <p className="text-sm text-gray-300 mt-1">{asset.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
            <Button onClick={handleCopy} variant="outline" size="sm" className="border-gray-600 gap-2">
              <Copy className="w-4 h-4" /> Copy URL
            </Button>
            <Button onClick={() => window.open(url, '_blank')} variant="outline" size="sm" className="border-gray-600 gap-2">
              <ExternalLink className="w-4 h-4" /> Open
            </Button>
            <Button onClick={handleDownload} variant="outline" size="sm" className="border-gray-600 gap-2">
              <Download className="w-4 h-4" /> Download
            </Button>
            <Button onClick={() => onReplace(asset)} variant="outline" size="sm" className="border-blue-700 text-blue-400 gap-2">
              <Replace className="w-4 h-4" /> Replace
            </Button>
            {asset.archived ? (
              <Button onClick={() => onUnarchive(asset)} variant="outline" size="sm" className="border-green-700 text-green-400 gap-2">
                <ArchiveRestore className="w-4 h-4" /> Unarchive
              </Button>
            ) : (
              <Button onClick={() => onArchive(asset)} variant="outline" size="sm" className="border-red-700 text-red-400 gap-2">
                <Archive className="w-4 h-4" /> Archive
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaField({ label, value }) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</label>
      <p className="text-sm text-gray-200 truncate">{value || '—'}</p>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}