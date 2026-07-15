import React, { useState, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Paperclip, X, Link2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { getMobileTextareaClass } from "@/components/mobile/MobileFormStyles";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import CommentLinkInput from "./CommentLinkInput";
import { CommentLinkCardEditable } from "./CommentLinkCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function CommentEditForm({ comment, onSaved, onCancel }) {
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);

  // Preload from existing comment
  const [text, setText] = useState(comment.content || "");
  const [existingPhotos, setExistingPhotos] = useState(comment.photos || []);
  const [stagedPhotos, setStagedPhotos] = useState([]); // { file, previewUrl }[]
  const [pendingLinks, setPendingLinks] = useState(comment.links || []);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const hasContent = text.trim().length > 0 || existingPhotos.length > 0 || stagedPhotos.length > 0 || pendingLinks.length > 0;

  const isDirty = useMemo(() => {
    if (text !== (comment.content || "")) return true;
    const origPhotos = comment.photos || [];
    if (existingPhotos.length !== origPhotos.length || !existingPhotos.every((p, i) => p === origPhotos[i])) return true;
    if (stagedPhotos.length > 0) return true;
    const origLinks = comment.links || [];
    if (pendingLinks.length !== origLinks.length) return true;
    return JSON.stringify(pendingLinks) !== JSON.stringify(origLinks);
  }, [text, existingPhotos, stagedPhotos, pendingLinks, comment]);

  const canSave = hasContent && isDirty && !saving && !uploading;

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const newPhotos = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setStagedPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = "";
  }, []);

  const removeStagedPhoto = useCallback((index) => {
    setStagedPhotos(prev => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const removeExistingPhoto = useCallback((index) => {
    setExistingPhotos(prev => prev.filter((_, i) => i !== index));
  }, []);

  const attemptCancel = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onCancel();
    }
  }, [isDirty, onCancel]);

  const confirmDiscard = useCallback(() => {
    stagedPhotos.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    setShowDiscardConfirm(false);
    onCancel();
  }, [stagedPhotos, onCancel]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    if (!hasContent) {
      toast({ title: "Comment cannot be empty. Use Delete Comment instead.", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      let newPhotoUrls = [];
      if (stagedPhotos.length > 0) {
        setUploading(true);
        const uploadResults = await Promise.all(
          stagedPhotos.map(p => base44.integrations.Core.UploadFile({ file: p.file }))
        );
        newPhotoUrls = uploadResults.map(r => r.file_url);
        setUploading(false);
      }

      const allPhotos = [...existingPhotos, ...newPhotoUrls];
      const updateData = {};
      if (text.trim()) {
        updateData.content = text.trim();
      } else {
        updateData.content = "";
      }
      updateData.photos = allPhotos.length > 0 ? allPhotos : [];
      updateData.links = pendingLinks.length > 0 ? pendingLinks : [];

      await base44.entities.TaskComment.update(comment.id, updateData);
      stagedPhotos.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      toast({ title: "Comment updated" });
      onSaved();
    } catch (err) {
      setUploading(false);
      toast({ title: "Failed to update comment", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [canSave, hasContent, stagedPhotos, existingPhotos, text, pendingLinks, comment.id, onSaved]);

  return (
    <>
      <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileSelect} className="hidden" />
      <div className="border border-blue-600/50 rounded-lg bg-gray-800/70 p-3 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Edit comment…"
          className={getMobileTextareaClass(isMobile, "bg-gray-900 border-gray-700 text-white min-h-[56px]")}
          autoFocus
        />

        {/* Existing + Staged photo previews */}
        {(existingPhotos.length > 0 || stagedPhotos.length > 0) && (
          <div className="grid grid-cols-4 md:grid-cols-5 gap-2">
            {existingPhotos.map((url, idx) => (
              <div key={`existing-${idx}`} className="relative group">
                <div className={cn("w-full bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden", isMobile ? "h-16" : "h-20")}>
                  <img src={url} alt={`Existing ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={() => removeExistingPhoto(idx)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {stagedPhotos.map((photo, idx) => (
              <div key={`staged-${idx}`} className="relative group">
                <div className={cn("w-full bg-gray-800 rounded-lg border border-green-700/50 flex items-center justify-center overflow-hidden", isMobile ? "h-16" : "h-20")}>
                  <img src={photo.previewUrl} alt={`New ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={() => removeStagedPhoto(idx)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Links */}
        {pendingLinks.length > 0 && (
          <div className="space-y-1.5">
            {pendingLinks.map((link, idx) => (
              <CommentLinkCardEditable
                key={idx}
                link={link}
                onRemove={() => setPendingLinks(prev => prev.filter((_, i) => i !== idx))}
              />
            ))}
          </div>
        )}

        {showLinkInput && (
          <CommentLinkInput
            onAdd={(link) => { setPendingLinks(prev => [...prev, link]); setShowLinkInput(false); }}
            onCancel={() => setShowLinkInput(false)}
          />
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-8 px-2 text-gray-400 hover:text-white hover:bg-gray-700">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowLinkInput(true)} disabled={showLinkInput} className="h-8 px-2 text-gray-400 hover:text-white hover:bg-gray-700">
            <Link2 className="w-4 h-4" />
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={attemptCancel} disabled={saving} className="h-8 text-xs text-gray-400 hover:text-white">
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!canSave} className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</> : <><Save className="w-3.5 h-3.5" />Save Changes</>}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard comment changes?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Your edits have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)} className="border-gray-700 text-white hover:bg-gray-800">
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard} className="bg-red-600 hover:bg-red-700 text-white">
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}