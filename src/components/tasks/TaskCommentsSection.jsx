import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send, Paperclip, X, Link2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ImageModal from "../ui/ImageModal";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getMobileTextareaClass } from "@/components/mobile/MobileFormStyles";
import CommentLinkInput from "./CommentLinkInput";
import { CommentLinkCardEditable, CommentLinkCardDisplay } from "./CommentLinkCard";

export default function TaskCommentsSection({ taskId, initialMaxVisible }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);
  const [newComment, setNewComment] = useState("");
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [pendingLinks, setPendingLinks] = useState([]);
  const [showLinkInput, setShowLinkInput] = useState(false);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['taskComments', taskId],
    queryFn: () => {
      if (!taskId) return Promise.resolve([]);
      return base44.entities.TaskComment.filter({ task_id: taskId });
    },
    enabled: !!taskId,
    staleTime: 30000,
    retry: false,
  });

  const createCommentMutation = useMutation({
    mutationFn: (data) => base44.entities.TaskComment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskComments', taskId] });
      setNewComment("");
      setUploadedPhotos([]);
      setPendingLinks([]);
      setShowLinkInput(false);
      toast.success('Comment added');
    },
    onError: () => {
      toast.error('Failed to add comment');
    },
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(file =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map(r => r.file_url);
      setUploadedPhotos([...uploadedPhotos, ...photoUrls]);
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    setUploadedPhotos(uploadedPhotos.filter(url => url !== urlToRemove));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    createCommentMutation.mutate({
      task_id: taskId,
      content: newComment,
      photos: uploadedPhotos,
      ...(pendingLinks.length > 0 ? { links: pendingLinks } : {}),
    });
  };

  const [showAll, setShowAll] = useState(!initialMaxVisible);

  const sortedComments = [...comments].sort((a, b) => 
    new Date(b.created_date) - new Date(a.created_date)
  );

  const visibleComments = showAll ? sortedComments : sortedComments.slice(0, initialMaxVisible || sortedComments.length);
  const hasHidden = !showAll && initialMaxVisible && sortedComments.length > initialMaxVisible;

  return (
    <>
      <div className="space-y-3">
        {/* Comments List — shown first so recent activity is visible immediately */}
        <div className={cn("space-y-3", showAll && "max-h-[400px] overflow-y-auto")}>
          {isLoading ? (
            <div className="text-center py-6 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1" />
              <span className="text-xs">Loading…</span>
            </div>
          ) : sortedComments.length === 0 ? (
            <p className="text-gray-500 text-sm py-1">No comments yet</p>
          ) : (
            <>
              {visibleComments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-3 bg-gray-800/50 rounded-lg border border-gray-700"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gradient-to-br from-red-600 to-red-800 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-[10px]">
                          {comment.created_by?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white leading-tight">
                          {comment.created_by || 'Unknown User'}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {format(new Date(comment.created_date), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{comment.content}</p>
                  
                  {comment.photos && comment.photos.length > 0 && (
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                      {comment.photos.map((url, idx) => (
                        <div
                          key={idx}
                          className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-red-500 transition-colors"
                          onClick={() => setSelectedImage(url)}
                        >
                          <img src={url} alt={`Attachment ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                        </div>
                      ))}
                    </div>
                  )}

                  {comment.links && comment.links.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {comment.links.map((link, idx) => (
                        <CommentLinkCardDisplay key={idx} link={link} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {hasHidden && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 py-1"
                >
                  View all {sortedComments.length} comments
                </button>
              )}
            </>
          )}
        </div>

        {/* Add Comment Form — after list so it doesn't push content down */}
        <form onSubmit={handleSubmit} className={isMobile ? "space-y-2" : "space-y-3"}>
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment…"
            className={getMobileTextareaClass(isMobile, "bg-gray-800 border-gray-700 text-white min-h-[56px]")}
          />
          
          {uploadedPhotos.length > 0 && (
            <div className="grid grid-cols-4 md:grid-cols-5 gap-2">
              {uploadedPhotos.map((url, idx) => (
                <div key={idx} className="relative group">
                  <div className={`w-full bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden ${isMobile ? 'h-16' : 'h-20'}`}>
                    <img src={url} alt={`Upload ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(url)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

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
              onAdd={(link) => {
                setPendingLinks(prev => [...prev, link]);
                setShowLinkInput(false);
              }}
              onCancel={() => setShowLinkInput(false)}
            />
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          {isMobile ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-800">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowLinkInput(true)} className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-800">
                <Link2 className="w-5 h-5" />
              </Button>
              {(uploadedPhotos.length > 0 || pendingLinks.length > 0) && (
                <span className="text-xs text-gray-400">
                  {[uploadedPhotos.length > 0 && `${uploadedPhotos.length} img`, pendingLinks.length > 0 && `${pendingLinks.length} link${pendingLinks.length > 1 ? 's' : ''}`].filter(Boolean).join(', ')}
                </span>
              )}
              <div className="flex-1" />
              <Button type="submit" size="sm" disabled={createCommentMutation.isPending || !newComment.trim()} className="h-10 px-4 bg-red-600 hover:bg-red-700">
                {createCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" />Send</>}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="border-gray-700 cursor-pointer" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</> : <><Paperclip className="w-4 h-4 mr-2" />Add Images</>}
              </Button>
              <Button type="button" variant="outline" className="border-gray-700 cursor-pointer" onClick={() => setShowLinkInput(true)}>
                <Link2 className="w-4 h-4 mr-2" />Add Link
              </Button>
              <Button type="submit" disabled={createCommentMutation.isPending || !newComment.trim()} className="bg-red-600 hover:bg-red-700 gap-2">
                {createCommentMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Posting...</> : <><Send className="w-4 h-4" />Add Comment</>}
              </Button>
            </div>
          )}
        </form>
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}