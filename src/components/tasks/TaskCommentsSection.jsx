import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import ImageModal from "@/components/ui/ImageModal";
import { CommentLinkCardDisplay } from "./CommentLinkCard";
import CommentComposer from "./CommentComposer";
import CommentActionMenu from "./CommentActionMenu";
import CommentEditForm from "./CommentEditForm";
import CommentDeleteConfirm from "./CommentDeleteConfirm";

export default function TaskCommentsSection({ taskId, initialMaxVisible }) {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(!initialMaxVisible);
  const [userName, setUserName] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Gallery state — scoped to one comment
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUserName(u?.full_name);
      setCurrentUserId(u?.id);
      setCurrentUserRole(u?.role);
    }).catch(() => {});
  }, []);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['taskComments', taskId],
    queryFn: () => taskId ? base44.entities.TaskComment.filter({ task_id: taskId }) : [],
    enabled: !!taskId,
    staleTime: 30000,
  });

  const sortedComments = [...comments].sort((a, b) =>
    new Date(b.created_date) - new Date(a.created_date)
  );

  const visibleComments = showAll
    ? sortedComments
    : sortedComments.slice(0, initialMaxVisible || sortedComments.length);
  const hasHidden = !showAll && initialMaxVisible && sortedComments.length > initialMaxVisible;

  // Permission check: author or admin
  const canActOn = useCallback((comment) => {
    if (currentUserRole === 'admin') return true;
    if (currentUserId && comment.created_by_id === currentUserId) return true;
    if (userName && comment.created_by === userName) return true;
    return false;
  }, [currentUserId, currentUserRole, userName]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (commentId) => base44.entities.TaskComment.delete(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskComments', taskId] });
      setDeleteTarget(null);
      toast({ title: "Comment deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete comment", variant: "destructive" });
    },
  });

  // Open comment-scoped gallery
  const openGallery = useCallback((photos, clickedIndex) => {
    setGalleryImages(photos);
    setGalleryIndex(clickedIndex);
  }, []);

  const closeGallery = useCallback(() => {
    setGalleryImages([]);
    setGalleryIndex(0);
  }, []);

  const invalidateComments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['taskComments', taskId] });
  }, [queryClient, taskId]);

  return (
    <>
      <div className="space-y-3">
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
              {visibleComments.map((comment) => {
                const isEditing = editingId === comment.id;
                const canAct = canActOn(comment);

                if (isEditing) {
                  return (
                    <CommentEditForm
                      key={comment.id}
                      comment={comment}
                      onSaved={() => { setEditingId(null); invalidateComments(); }}
                      onCancel={() => setEditingId(null)}
                    />
                  );
                }

                return (
                  <div key={comment.id} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 group">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-red-600 to-red-800 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-white font-bold text-[10px]">
                            {(comment.created_by || 'U').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white leading-tight">
                            {comment.created_by || 'Unknown User'}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {format(new Date(comment.created_date), 'MMM d, h:mm a')}
                            {comment.updated_date && comment.updated_date !== comment.created_date && (
                              <span className="text-gray-600 ml-1">(edited)</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {canAct && (
                        <CommentActionMenu
                          onEdit={() => setEditingId(comment.id)}
                          onDelete={() => setDeleteTarget(comment)}
                        />
                      )}
                    </div>

                    {comment.content && (
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{comment.content}</p>
                    )}

                    {comment.photos?.length > 0 && (
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                        {comment.photos.map((url, idx) => (
                          <div
                            key={idx}
                            className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-red-500 transition-colors"
                            onClick={() => openGallery(comment.photos, idx)}
                          >
                            <img src={url} alt={`Photo ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                          </div>
                        ))}
                      </div>
                    )}

                    {comment.links?.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {comment.links.map((link, idx) => (
                          <CommentLinkCardDisplay key={idx} link={link} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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

        <CommentComposer
          taskId={taskId}
          userName={userName}
          onPosted={invalidateComments}
        />
      </div>

      {/* Comment-scoped image gallery */}
      <ImageModal
        isOpen={galleryImages.length > 0}
        onClose={closeGallery}
        images={galleryImages}
        currentIndex={galleryIndex}
        onNavigate={setGalleryIndex}
      />

      {/* Delete confirmation */}
      <CommentDeleteConfirm
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}