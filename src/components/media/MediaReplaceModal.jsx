import React, { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Replace, Loader2, Copy, Search, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

export default function MediaReplaceModal({ asset, open, onClose, onSuccess, onFindReferences }) {
  const [newFile, setNewFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [result, setResult] = useState(null); // { oldUrl, newUrl, newAssetId }
  const fileInputRef = useRef(null);

  if (!asset) return null;

  const handleFileSelect = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Invalid file type');
      return;
    }
    setNewFile(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleReplace = async () => {
    if (!newFile) return;
    setReplacing(true);

    const user = await base44.auth.me();
    const { file_url } = await base44.integrations.Core.UploadFile({ file: newFile });

    // Read dimensions
    let width = 0, height = 0;
    try {
      const img = new window.Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = preview; });
      width = img.width; height = img.height;
    } catch {}

    const oldUrl = asset.public_url || asset.file_url;

    // Create new MediaAsset for replacement
    const fileName = newFile.name || asset.file_name;
    const folderPath = asset.folder_path || '';
    const relativePath = folderPath ? `${folderPath}/${fileName}` : fileName;

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

    setResult({ oldUrl, newUrl: file_url, newAssetId: newAsset.id });
    setReplacing(false);
    toast.success('Replacement uploaded — choose what to do with the old asset below.');
  };

  const handleSupersede = async () => {
    if (!result) return;
    const user = await base44.auth.me();
    await base44.entities.MediaAsset.update(asset.id, {
      status: 'superseded',
      superseded_by_url: result.newUrl,
      superseded_by_asset_id: result.newAssetId,
      superseded_at: new Date().toISOString(),
      superseded_by_user: user?.id,
      replacement_note: `Replaced by upload on ${new Date().toLocaleDateString()}`,
    });
    toast.success('Old asset marked as superseded');
    onSuccess();
  };

  const handleKeepActive = () => {
    toast.info('Old asset kept active');
    onSuccess();
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied');
  };

  const currentUrl = asset.public_url || asset.file_url;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Replace className="w-5 h-5 text-orange-400" />
            Upload Replacement — URL Will Change
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5 text-xs text-red-300/90 space-y-1">
            <p><strong>⚠ This will NOT update hardcoded references already using the old URL.</strong></p>
            <p>Base44 generates a <strong>new URL</strong> per upload. The old file remains at its original URL.</p>
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
                onClick={() => !result && fileInputRef.current?.click()}
                className={`mt-1 aspect-square bg-gray-950 rounded-lg border-2 overflow-hidden flex items-center justify-center transition-colors ${
                  result ? 'border-green-700' : 'border-dashed border-gray-600 hover:border-purple-500 cursor-pointer'
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
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />

          {newFile && !result && (
            <>
              <div className="bg-gray-800/50 p-2 rounded border border-gray-700 text-sm text-gray-300">
                {newFile.name} • {formatSize(newFile.size)}
              </div>
              <Button
                onClick={handleReplace}
                disabled={replacing}
                className="bg-orange-600 hover:bg-orange-700 gap-2 w-full"
              >
                {replacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload Replacement
              </Button>
            </>
          )}

          {/* Post-upload actions */}
          {result && (
            <div className="space-y-3 border-t border-gray-700 pt-3">
              <h4 className="text-xs text-gray-500 uppercase tracking-wider">URL Comparison</h4>
              <div className="space-y-2">
                <div className="bg-gray-800/50 rounded p-2">
                  <label className="text-[9px] text-gray-600 uppercase">Old URL</label>
                  <div className="flex items-center gap-1">
                    <code className="text-[10px] text-red-300 flex-1 break-all">{result.oldUrl}</code>
                    <button onClick={() => copyUrl(result.oldUrl)} className="text-gray-500 hover:text-white flex-shrink-0"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="flex justify-center"><ArrowRight className="w-4 h-4 text-gray-600" /></div>
                <div className="bg-gray-800/50 rounded p-2">
                  <label className="text-[9px] text-gray-600 uppercase">New URL</label>
                  <div className="flex items-center gap-1">
                    <code className="text-[10px] text-green-300 flex-1 break-all">{result.newUrl}</code>
                    <button onClick={() => copyUrl(result.newUrl)} className="text-gray-500 hover:text-white flex-shrink-0"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>

              <h4 className="text-xs text-gray-500 uppercase tracking-wider">What to do with old asset?</h4>
              <div className="space-y-2">
                {onFindReferences && (
                  <Button
                    onClick={() => onFindReferences(result.oldUrl, result.newUrl)}
                    variant="outline"
                    className="w-full border-orange-700 text-orange-400 justify-start gap-2 text-xs"
                  >
                    <Search className="w-3.5 h-3.5" /> Find & Replace Old URL in App References
                  </Button>
                )}
                <Button
                  onClick={handleSupersede}
                  variant="outline"
                  className="w-full border-yellow-700 text-yellow-400 justify-start gap-2 text-xs"
                >
                  <Replace className="w-3.5 h-3.5" /> Mark Old Asset as Superseded
                </Button>
                <Button
                  onClick={handleKeepActive}
                  variant="outline"
                  className="w-full border-gray-600 text-gray-300 justify-start gap-2 text-xs"
                >
                  Keep Old Asset Active
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            {result ? 'Done' : 'Cancel'}
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