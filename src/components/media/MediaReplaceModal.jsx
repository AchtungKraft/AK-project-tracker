import React, { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Replace, Loader2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

export default function MediaReplaceModal({ asset, open, onClose, onSuccess }) {
  const [newFile, setNewFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef(null);

  if (!asset) return null;

  const handleFileSelect = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Invalid file type');
      return;
    }
    setNewFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleReplace = async () => {
    if (!newFile) return;
    setReplacing(true);

    try {
      const user = await base44.auth.me();
      const { file_url } = await base44.integrations.Core.UploadFile({ file: newFile });

      // Read dimensions
      let width = 0, height = 0;
      try {
        const img = new window.Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = preview;
        });
        width = img.width;
        height = img.height;
      } catch (e) { /* ignore */ }

      await base44.entities.MediaAsset.update(asset.id, {
        public_url: file_url,
        file_url: file_url,
        file_size: newFile.size,
        mime_type: newFile.type,
        width,
        height,
        version: (asset.version || 1) + 1,
        replaced_at: new Date().toISOString(),
        replaced_by: user?.id || 'unknown',
      });

      toast.success('Image replaced. URL updated.');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error('Replace failed: ' + err.message);
    } finally {
      setReplacing(false);
    }
  };

  const currentUrl = asset.public_url || asset.file_url;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Replace className="w-5 h-5 text-blue-400" />
            Replace Image
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-400">
              Replace <span className="text-purple-400 font-mono">{asset.file_name}</span> with a new file.
            </p>
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2.5 text-xs text-yellow-300/90">
              <strong>⚠ Storage Limitation:</strong> Base44 generates a new URL for each upload.
              The old URL will stop working. The MediaAsset record will point to the new URL,
              so references using this record's ID will auto-update, but any
              hardcoded URL references elsewhere will need manual updating.
            </div>
          </div>

          {/* Before / After */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Current (v{asset.version || 1})</label>
              <div className="mt-1 aspect-square bg-gray-950 rounded-lg border border-gray-700 overflow-hidden flex items-center justify-center">
                <img src={currentUrl} alt="Current" className="max-w-full max-h-full object-contain" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">New (v{(asset.version || 1) + 1})</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 aspect-square bg-gray-950 rounded-lg border-2 border-dashed border-gray-600 hover:border-purple-500 overflow-hidden flex items-center justify-center cursor-pointer transition-colors"
              >
                {preview ? (
                  <img src={preview} alt="New" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                    <p className="text-xs text-gray-500">Click to select</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />

          {newFile && (
            <div className="bg-gray-800/50 p-2 rounded border border-gray-700 text-sm text-gray-300">
              {newFile.name} • {formatSize(newFile.size)}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600" disabled={replacing}>
            Cancel
          </Button>
          <Button
            onClick={handleReplace}
            disabled={!newFile || replacing}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {replacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Replace className="w-4 h-4" />}
            Replace Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}