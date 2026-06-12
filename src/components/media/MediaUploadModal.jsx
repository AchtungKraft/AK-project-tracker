import React, { useState, useCallback, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Image, X, Loader2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const BASE_URL = 'https://media.base44.com/images/public/';

export default function MediaUploadModal({ open, onClose, currentPath, existingAssets, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [duplicateFile, setDuplicateFile] = useState(null);
  const [duplicateAction, setDuplicateAction] = useState(null);
  const fileInputRef = useRef(null);

  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(`${file.name}: Invalid file type. Only PNG, JPG, WEBP, GIF allowed.`);
      return false;
    }
    if (file.size > MAX_SIZE) {
      toast.error(`${file.name}: File too large. Max 10MB.`);
      return false;
    }
    return true;
  };

  const addFiles = (newFiles) => {
    const valid = Array.from(newFiles).filter(validateFile);
    valid.forEach(file => {
      // Check for duplicates
      const existingDuplicate = existingAssets.find(a =>
        a.file_name === file.name && (a.folder_path || '') === (currentPath || '')
      );
      if (existingDuplicate) {
        setDuplicateFile({ file, existing: existingDuplicate });
        return;
      }
      addFileEntry(file);
    });
  };

  const addFileEntry = (file, overrideName = null) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        setFiles(prev => [...prev, {
          file,
          preview: e.target.result,
          name: overrideName || file.name,
          width: img.width,
          height: img.height,
          size: file.size,
          type: file.type,
        }]);
      };
      img.onerror = () => {
        setFiles(prev => [...prev, {
          file,
          preview: e.target.result,
          name: overrideName || file.name,
          width: 0,
          height: 0,
          size: file.size,
          type: file.type,
        }]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDuplicateAction = (action) => {
    if (!duplicateFile) return;
    const { file, existing } = duplicateFile;

    if (action === 'replace') {
      // Will be handled during upload — mark for replacement
      addFileEntry(file);
      setDuplicateFile(null);
    } else if (action === 'rename') {
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
      const baseName = file.name.replace(ext, '');
      let counter = 2;
      let newName = `${baseName}-${counter}${ext}`;
      while (existingAssets.find(a => a.file_name === newName && (a.folder_path || '') === (currentPath || ''))) {
        counter++;
        newName = `${baseName}-${counter}${ext}`;
      }
      addFileEntry(file, newName);
      setDuplicateFile(null);
    } else if (action === 'new') {
      addFileEntry(file);
      setDuplicateFile(null);
    } else {
      setDuplicateFile(null);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [existingAssets, currentPath]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles = [];
    for (const item of items) {
      if (item.kind === 'file' && ALLOWED_TYPES.includes(item.type)) {
        pastedFiles.push(item.getAsFile());
      }
    }
    if (pastedFiles.length > 0) addFiles(pastedFiles);
  }, [existingAssets, currentPath]);

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    let successCount = 0;
    for (const entry of files) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: entry.file });

        const folderPath = currentPath || '';
        const relativePath = folderPath ? `${folderPath}/${entry.name}` : entry.name;

        await base44.entities.MediaAsset.create({
          file_name: entry.name,
          full_relative_path: relativePath,
          folder_path: folderPath,
          public_url: file_url,
          file_url: file_url,
          mime_type: entry.type,
          file_size: entry.size,
          width: entry.width,
          height: entry.height,
          type: 'image',
          status: 'active',
          archived: false,
          version: 1,
          source_context: 'upload',
        });
        successCount++;
      } catch (err) {
        toast.error(`Failed to upload ${entry.name}: ${err.message}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} file(s) uploaded`);
      onSuccess();
    }
    setFiles([]);
    setUploading(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open && !duplicateFile} onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-lg" onPaste={handlePaste}>
          <DialogHeader>
            <DialogTitle className="text-white">Upload Images</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current path */}
            <div className="text-sm text-gray-400">
              Uploading to: <span className="text-purple-400 font-mono">{currentPath || '/ (root)'}</span>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-purple-500 bg-purple-900/20'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-800/30'
              }`}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-gray-300 mb-1">Drag & drop images here</p>
              <p className="text-xs text-gray-500">or click to browse • PNG, JPG, WEBP, GIF • Max 10MB</p>
              <p className="text-xs text-gray-600 mt-1">You can also paste images (Ctrl+V)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {files.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-gray-800/50 p-2 rounded-lg border border-gray-700">
                    <img src={entry.preview} alt="" className="w-10 h-10 object-cover rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{entry.name}</p>
                      <p className="text-xs text-gray-500">
                        {entry.width}×{entry.height} • {formatSize(entry.size)}
                      </p>
                    </div>
                    <button onClick={() => removeFile(idx)} className="text-gray-400 hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} className="border-gray-600" disabled={uploading}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || uploading}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload {files.length > 0 ? `(${files.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Detection Modal */}
      <Dialog open={!!duplicateFile} onOpenChange={() => setDuplicateFile(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              File Already Exists
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              A file named <span className="text-purple-400 font-mono">{duplicateFile?.file?.name}</span> already exists in this folder.
            </p>
            <div className="space-y-2">
              <Button onClick={() => handleDuplicateAction('replace')} variant="outline" className="w-full border-blue-700 text-blue-400 justify-start gap-2">
                Replace Existing (preserve URL)
              </Button>
              <Button onClick={() => handleDuplicateAction('rename')} variant="outline" className="w-full border-gray-600 justify-start gap-2">
                Rename Automatically
              </Button>
              <Button onClick={() => handleDuplicateAction('new')} variant="outline" className="w-full border-gray-600 justify-start gap-2">
                Upload As New Version
              </Button>
              <Button onClick={() => setDuplicateFile(null)} variant="ghost" className="w-full text-gray-400 justify-start">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}