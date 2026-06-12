import React, { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Replace, Loader2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

/**
 * Step 1 of Replace Asset Everywhere:
 * User selects existing asset → uploads replacement → new MediaAsset created → 
 * hands off to MigrationPreview with { oldAsset, newAsset, oldUrl, newUrl }
 */
export default function MediaReplaceModal({ asset, open, onClose, onSuccess, onStartMigration }) {
  const [newFile, setNewFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
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

  const handleUploadAndContinue = async () => {
    if (!newFile) return;
    setUploading(true);

    const user = await base44.auth.me();
    const { file_url } = await base44.integrations.Core.UploadFile({ file: newFile });

    // Read dimensions from preview
    let width = 0, height = 0;
    try {
      const img = new window.Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = preview; });
      width = img.width; height = img.height;
    } catch {}

    const oldUrl = asset.public_url || asset.file_url;
    const fileName = newFile.name || asset.file_name;
    const folderPath = asset.folder_path || '';
    const relativePath = folderPath ? `${folderPath}/${fileName}` : fileName;

    // Create new MediaAsset record
    const newAsset = await base44.entities.MediaAsset.create({
      file_name: fileName,
      full_relative_path: relativePath,
      folder_path: folderPath,
      public_url: file_url,
      file_url: file_url,
      mime_type: newFile.type,
      file_size: newFile.size,
      width, height,
      type: 'image',
      status: 'active',
      archived: false,
      version: (asset.version || 1) + 1,
      source_context: 'upload',
      notes: `Replacement for ${asset.file_name}`,
    });

    setUploading(false);

    // Hand off to migration preview
    onStartMigration({
      oldAsset: asset,
      newAsset: newAsset,
      oldUrl: oldUrl,
      newUrl: file_url,
    });
  };

  const handleClose = () => {
    setNewFile(null);
    setPreview(null);
    onClose();
  };

  const currentUrl = asset.public_url || asset.file_url;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Replace className="w-5 h-5 text-orange-400" />
            Replace Asset Everywhere
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 text-xs text-gray-400 space-y-1">
            <p>Upload a replacement image. A <strong>new URL</strong> will be generated.</p>
            <p>You'll then see every reference to the old URL and confirm the migration.</p>
          </div>

          {/* Before / After preview */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Current</label>
              <div className="mt-1 aspect-square bg-gray-950 rounded-lg border border-gray-700 overflow-hidden flex items-center justify-center">
                <img src={currentUrl} alt="Current" className="max-w-full max-h-full object-contain" />
              </div>
              <p className="text-[10px] text-gray-500 mt-1 truncate">{asset.file_name}</p>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Replacement</label>
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`mt-1 aspect-square bg-gray-950 rounded-lg border-2 overflow-hidden flex items-center justify-center transition-colors ${
                  preview ? 'border-green-700' : 'border-dashed border-gray-600 hover:border-purple-500 cursor-pointer'
                }`}
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
              {newFile && <p className="text-[10px] text-gray-500 mt-1 truncate">{newFile.name} • {formatSize(newFile.size)}</p>}
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
            <Button
              onClick={handleUploadAndContinue}
              disabled={uploading}
              className="bg-orange-600 hover:bg-orange-700 gap-2 w-full"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              ) : (
                <><ArrowRight className="w-4 h-4" /> Upload & Scan References</>
              )}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="border-gray-600">Cancel</Button>
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