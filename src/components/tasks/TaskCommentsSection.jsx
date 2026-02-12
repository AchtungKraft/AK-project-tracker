import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send, Paperclip, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ImageModal from "../ui/ImageModal";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { getMobileTextareaClass } from "@/components/mobile/MobileFormStyles";

export default function TaskCommentsSection({ taskId }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);
  const [newComment, setNewComment] = useState("");
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

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
      setUploadedPhotos([]);
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
    });
  };

  const sortedComments = [...comments].sort((a, b) => 
    new Date(b.created_date) - new Date(a.created_date)
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-700">
          <MessageSquare className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-white">Comments & Notes</h3>
          <span className="text-sm text-gray-500">({comments.length})</span>
        </div>

        {/* Add Comment Form */}
        <form onSubmit={handleSubmit} className={isMobile ? "space-y-2" : "space-y-3"}>
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment or note..."
            className={getMobileTextareaClass(isMobile, "bg-gray-800 border-gray-700 text-white min-h-[60px]")}
          />
          
          {/* Photo Upload & Preview */}
          {uploadedPhotos.length > 0 && (
            <div className="grid grid-cols-4 md:grid-cols-5 gap-2">
              {uploadedPhotos.map((url, idx) => (
                <div key={idx} className="relative group">
                  <div className={`w-full bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden ${isMobile ? 'h-16' : 'h-20'}`}>
                    <img
                      src={url}
                      alt={`Upload ${idx + 1}`}
                      className="max-w-full max-h-full object-contain"
                    />
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

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          {/* Action Bar - Compact on mobile */}
          {isMobile ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </Button>
              
              {uploadedPhotos.length > 0 && (
                <span className="text-xs text-gray-400">{uploadedPhotos.length} attached</span>
              )}
              
              <div className="flex-1" />
              
              <Button
                type="submit"
                size="sm"
                disabled={createCommentMutation.isPending || !newComment.trim()}
                className="h-10 px-4 bg-red-600 hover:bg-red-700"
              >
                {createCommentMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-gray-700 cursor-pointer"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Paperclip className="w-4 h-4 mr-2" />
                    Add Images
                  </>
                )}
              </Button>
              
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
            </div>
          )}
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
                
                {/* Display attached images */}
                {comment.photos && comment.photos.length > 0 && (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mt-3">
                    {comment.photos.map((url, idx) => (
                      <div
                        key={idx}
                        className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-red-500 transition-colors"
                        onClick={() => setSelectedImage(url)}
                      >
                        <img
                          src={url}
                          alt={`Attachment ${idx + 1}`}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}