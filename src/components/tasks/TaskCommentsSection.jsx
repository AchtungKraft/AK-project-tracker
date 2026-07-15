import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import ImageModal from "../ui/ImageModal";
import { CommentLinkCardDisplay } from "./CommentLinkCard";
import CommentComposer from "./CommentComposer";

export default function TaskCommentsSection({ taskId, initialMaxVisible }) {
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState(null);
  const [showAll, setShowAll] = useState(!initialMaxVisible);
  const [userName, setUserName] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setUserName(u?.full_name)).catch(() => {});
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

  return (
    <>
      <div className="space-y-3">
        {/* Comments list */}
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
                <div key={comment.id} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gradient-to-br from-red-600 to-red-800 rounded-full flex items-center justify-center">
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
                        </p>
                      </div>
                    </div>
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
                          onClick={() => setSelectedImage(url)}
                        >
                          <img src={url} alt={`Attachment ${idx + 1}`} className="max-w-full max-h-full object-contain" />
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

        {/* Unified comment composer */}
        <CommentComposer
          taskId={taskId}
          userName={userName}
          onPosted={() => queryClient.invalidateQueries({ queryKey: ['taskComments', taskId] })}
        />
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}