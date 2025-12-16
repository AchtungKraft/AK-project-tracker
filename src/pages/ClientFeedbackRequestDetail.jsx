import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Upload, Plus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ClientFeedbackThread from "../components/clientportal/ClientFeedbackThread";
import ClientImageReviewGallery from "../components/clientportal/ClientImageReviewGallery";

export default function ClientFeedbackRequestDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('id');
  const projectId = urlParams.get('projectId');

  const [clientContactId, setClientContactId] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [newLinks, setNewLinks] = useState(['']);

  useEffect(() => {
    const contactId = localStorage.getItem('client_contact_id');
    if (!contactId) {
      navigate(createPageUrl("ClientLogin"));
      return;
    }
    setClientContactId(contactId);
  }, [navigate]);

  const { data: request } = useQuery({
    queryKey: ['clientFeedbackRequest', requestId],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({ id: requestId }),
    select: (data) => data[0],
    enabled: !!requestId,
  });

  const createCommentMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackComment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackComments'] });
      setNewComment('');
      setNewLinks(['']);
    },
  });

  const createAttachmentMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackAttachment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments'] });
    },
  });

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingImages(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await createAttachmentMutation.mutateAsync({
          request_id: requestId,
          attachment_type: 'image',
          file_url,
          created_by_type: 'client_contact',
          created_by_id: clientContactId,
        });
      }
      toast.success('Images uploaded');
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() && newLinks.every(l => !l.trim())) {
      toast.error('Please enter a comment or add a link');
      return;
    }

    try {
      const comment = await createCommentMutation.mutateAsync({
        request_id: requestId,
        author_type: 'client_contact',
        author_id: clientContactId,
        body: newComment,
        visibility: 'client_visible',
        target_type: 'request',
      });

      for (const link of newLinks) {
        if (link.trim()) {
          await createAttachmentMutation.mutateAsync({
            request_id: requestId,
            comment_id: comment.id,
            attachment_type: 'link',
            link_url: link.trim(),
            created_by_type: 'client_contact',
            created_by_id: clientContactId,
          });
        }
      }

      toast.success('Comment added');
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  if (!clientContactId || !request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("ClientProjectPortal") + `?id=${projectId}`)}
            className="border-gray-700 text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{request.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {request.request_type.replace('_', ' ')}
              </Badge>
              {request.due_date && (
                <Badge variant="outline" className="text-xs">
                  Due: {format(new Date(request.due_date), 'MMM d, yyyy')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {request.body && (
          <Card className="bg-black/60 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-4">
              <p className="text-gray-300 whitespace-pre-wrap">{request.body}</p>
            </CardContent>
          </Card>
        )}

        <ClientFeedbackThread
          requestId={requestId}
          clientContactId={clientContactId}
          isClientView={true}
        />

        <ClientImageReviewGallery
          requestId={requestId}
          clientContactId={clientContactId}
          requestType={request.request_type}
        />

        <Card className="bg-black/60 backdrop-blur-xl border border-gray-700">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-white">Add Comment</h3>

            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
            />

            <div className="space-y-2">
              <Label className="text-xs text-gray-400">Add Links (optional)</Label>
              {newLinks.map((link, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={link}
                    onChange={(e) => {
                      const updated = [...newLinks];
                      updated[idx] = e.target.value;
                      setNewLinks(updated);
                    }}
                    placeholder="https://..."
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                  {idx === newLinks.length - 1 && (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setNewLinks([...newLinks, ''])}
                      className="border-gray-700"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('client-image-upload').click()}
                disabled={uploadingImages}
                className="border-gray-700"
              >
                {uploadingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Upload Images
              </Button>
              <input
                id="client-image-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />

              <Button
                onClick={handleAddComment}
                disabled={createCommentMutation.isPending}
                className="bg-red-600 hover:bg-red-700 ml-auto"
              >
                {createCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}