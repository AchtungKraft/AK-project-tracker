import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Paperclip, X, Link2, Plus } from "lucide-react";
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

export default function CommentComposer({ taskId, onPosted, userName }) {
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [stagedPhotos, setStagedPhotos] = useState([]); // { file, previewUrl }[]
  const [pendingLinks, setPendingLinks] = useState([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Track the callback to run after discard confirm
  const discardCallbackRef = useRef(null);

  const isDirty = text.trim().length > 0 || stagedPhotos.length > 0 || pendingLinks.length > 0;
  const canPost = isDirty && !posting && !uploading;

  const clearDraft = useCallback(() => {
    setText("");
    // Revoke object URLs to prevent leaks
    stagedPhotos.forEach(p => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
    setStagedPhotos([]);
    setPendingLinks([]);
    setShowLinkInput(false);
  }, [stagedPhotos]);

  // Attempt to close — check for dirty draft
  const attemptClose = useCallback((afterClose) => {
    if (isDirty) {
      discardCallbackRef.current = afterClose || null;
      setShowDiscardConfirm(true);
    } else {
      clearDraft();
      setIsOpen(false);
      if (afterClose) afterClose();
    }
  }, [isDirty, clearDraft]);

  const confirmDiscard = useCallback(() => {
    clearDraft();
    setIsOpen(false);
    setShowDiscardConfirm(false);
    if (discardCallbackRef.current) {
      discardCallbackRef.current();
      discardCallbackRef.current = null;
    }
  }, [clearDraft]);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const newPhotos = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setStagedPhotos(prev => [...prev, ...newPhotos]);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }, []);

  const removeStagedPhoto = useCallback((index) => {
    setStagedPhotos(prev => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handlePost = useCallback(async () => {
    if (!canPost) return;
    setPosting(true);

    try {
      // Step 1: Upload staged photos
      let photoUrls = [];
      if (stagedPhotos.length > 0) {
        setUploading(true);
        const uploadResults = await Promise.all(
          stagedPhotos.map(p => base44.integrations.Core.UploadFile({ file: p.file }))
        );
        photoUrls = uploadResults.map(r => r.file_url);
        setUploading(false);
      }

      // Step 2: Create comment
      const commentData = { task_id: taskId };
      if (text.trim()) commentData.content = text.trim();
      if (photoUrls.length > 0) commentData.photos = photoUrls;
      if (pendingLinks.length > 0) commentData.links = pendingLinks;
      if (userName) commentData.created_by = userName;

      await base44.entities.TaskComment.create(commentData);

      // Step 3: Clean up
      clearDraft();
      setIsOpen(false);
      toast({ title: "Comment posted" });
      if (onPosted) onPosted();
    } catch (err) {
      // Keep draft intact on failure
      setUploading(false);
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }, [canPost, stagedPhotos, text, pendingLinks, taskId, userName, clearDraft, onPosted]);

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept="image/*"
      onChange={handleFileSelect}
      className="hidden"
    />
  );

  if (!isOpen) {
    return (
      <>
        {fileInput}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="h-8 text-xs border-gray-700 text-gray-400 gap-1.5"
        >
          <Plus className="w-3 h-3" />
          Add Comment
        </Button>
      </>
    );
  }

  return (
    <>
      {fileInput}
      <div className="border border-gray-700 rounded-lg bg-gray-800/50 p-3 space-y-2">
        {/* Text input */}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          className={getMobileTextareaClass(isMobile, "bg-gray-900 border-gray-700 text-white min-h-[56px]")}
          autoFocus
        />

        {/* Staged photo previews */}
        {stagedPhotos.length > 0 && (
          <div className="grid grid-cols-4 md:grid-cols-5 gap-2">
            {stagedPhotos.map((photo, idx) => (
              <div key={idx} className="relative group">
                <div className={cn("w-full bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden", isMobile ? "h-16" : "h-20")}>
                  <img src={photo.previewUrl} alt={`Staged ${idx + 1}`} className="max-w-full max-h-full object-contain" />
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

        {/* Staged links */}
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

        {/* Link input */}
        {showLinkInput && (
          <CommentLinkInput
            onAdd={(link) => {
              setPendingLinks(prev => [...prev, link]);
              setShowLinkInput(false);
            }}
            onCancel={() => setShowLinkInput(false)}
          />
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-8 px-2 text-gray-400 hover:text-white hover:bg-gray-700"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowLinkInput(true)}
            disabled={showLinkInput}
            className="h-8 px-2 text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <Link2 className="w-4 h-4" />
          </Button>

          {(stagedPhotos.length > 0 || pendingLinks.length > 0) && (
            <span className="text-[10px] text-gray-500">
              {[
                stagedPhotos.length > 0 && `${stagedPhotos.length} photo${stagedPhotos.length > 1 ? 's' : ''}`,
                pendingLinks.length > 0 && `${pendingLinks.length} link${pendingLinks.length > 1 ? 's' : ''}`,
              ].filter(Boolean).join(', ')} staged
            </span>
          )}

          <div className="flex-1" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => attemptClose()}
            disabled={posting}
            className="h-8 text-xs text-gray-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePost}
            disabled={!canPost}
            className="h-8 px-4 bg-red-600 hover:bg-red-700 text-white gap-1.5"
          >
            {posting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Posting…</>
            ) : (
              <><Send className="w-3.5 h-3.5" />Post Comment</>
            )}
          </Button>
        </div>
      </div>

      {/* Discard confirmation */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved comment?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Your text and attached files have not been posted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowDiscardConfirm(false)}
              className="border-gray-700 text-white hover:bg-gray-800"
            >
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Discard Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}