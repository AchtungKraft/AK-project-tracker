import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function TaskCommentsSection({ taskId }) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['taskComments', taskId],
    queryFn: () => base44.entities.TaskComment.filter({ task_id: taskId }),
    enabled: !!taskId,
  });

  const createCommentMutation = useMutation({
    mutationFn: (data) => base44.entities.TaskComment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskComments', taskId] });
      setNewComment("");
      toast.success('Comment added');
    },
    onError: () => {
      toast.error('Failed to add comment');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    createCommentMutation.mutate({
      task_id: taskId,
      content: newComment,
    });
  };

  const sortedComments = [...comments].sort((a, b) => 
    new Date(b.created_date) - new Date(a.created_date)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-700">
        <MessageSquare className="w-5 h-5 text-gray-400" />
        <h3 className="text-lg font-semibold text-white">Comments & Notes</h3>
        <span className="text-sm text-gray-500">({comments.length})</span>
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment or note for the team..."
          className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
        />
        <Button
          type="submit"
          disabled={createCommentMutation.isPending || !newComment.trim()}
          className="bg-red-600 hover:bg-red-700 gap-2"
        >
          {createCommentMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Posting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Add Comment
            </>
          )}
        </Button>
      </form>

      {/* Comments List */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading comments...
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No comments yet. Be the first to add a note!
          </div>
        ) : (
          sortedComments.map((comment) => (
            <div
              key={comment.id}
              className="p-4 bg-gray-800/50 rounded-lg border border-gray-700"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-red-800 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">
                      {comment.created_by?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {comment.created_by || 'Unknown User'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(comment.created_date), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{comment.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}