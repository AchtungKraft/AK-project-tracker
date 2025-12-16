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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowLeft, Send, Upload, Plus, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ClientFeedbackThread from "../components/clientportal/ClientFeedbackThread.jsx";
import ClientImageReviewGallery from "../components/clientportal/ClientImageReviewGallery.jsx";

export default function ClientFeedbackRequestDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('id');
  const token = urlParams.get('token');

  const [clientAccess, setClientAccess] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newLinks, setNewLinks] = useState(['']);
  const [showRequestDecisionForm, setShowRequestDecisionForm] = useState(false);
  const [requestDecisionType, setRequestDecisionType] = useState('');
  const [requestDecisionNote, setRequestDecisionNote] = useState('');

  useEffect(() => {
    if (!token) return;

    base44.entities.ProjectClientAccess.filter({
      share_token: token,
      access_status: 'active',
    }).then(access => {
      if (access.length > 0) {
        setClientAccess(access[0]);
      }
    });
  }, [token]);

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

  const createRequestDecisionMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackDecision.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
      setRequestDecisionNote('');
      setShowRequestDecisionForm(false);
      toast.success('Decision recorded');
    },
  });

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!clientAccess) {
      toast.error('Unable to upload: access not verified');
      return;
    }

    setUploadingImages(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await createAttachmentMutation.mutateAsync({
          request_id: requestId,
          attachment_type: 'image',
          file_url,
          created_by_type: 'client_contact',
          created_by_id: clientAccess.client_contact_id,
        });
      }
      toast.success('Images uploaded');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload images');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!clientAccess) {
      toast.error('Unable to upload: access not verified');
      return;
    }

    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await createAttachmentMutation.mutateAsync({
        request_id: requestId,
        attachment_type: 'file',
        file_url,
        label: file.name,
        created_by_type: 'client_contact',
        created_by_id: clientAccess.client_contact_id,
      });
      toast.success('File uploaded');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleApproveRequest = () => {
    setRequestDecisionType('approved');
    setShowRequestDecisionForm(true);
  };

  const handleRequestChangesRequest = () => {
    setRequestDecisionType('changes_requested');
    setShowRequestDecisionForm(true);
  };

  const handleSubmitRequestDecision = async () => {
    if (requestDecisionType === 'changes_requested' && !requestDecisionNote.trim()) {
      toast.error('Please provide a note explaining the requested changes');
      return;
    }

    if (!clientAccess) {
      toast.error('Access not verified. Please refresh.');
      return;
    }

    try {
      await createRequestDecisionMutation.mutateAsync({
        request_id: requestId,
        decided_by_type: 'client_contact',
        decided_by_id: clientAccess.client_contact_id,
        decision: requestDecisionType,
        note: requestDecisionNote,
        target_type: 'request',
        decided_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Decision error:', error);
      toast.error('Failed to record decision');
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
        author_id: clientAccess.client_contact_id,
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
            created_by_id: clientAccess.client_contact_id,
          });
        }
      }

      toast.success('Comment added');
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  if (!token || !clientAccess || !request) {
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
            onClick={() => navigate(createPageUrl("ClientProjectPortal") + `?token=${token}`)}
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

            {request.request_type !== 'image_review' && clientAccess?.access_role === 'approver' && (
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={handleApproveRequest}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Approve Request
                </Button>
                <Button
                  size="sm"
                  onClick={handleRequestChangesRequest}
                  variant="outline"
                  className="border-orange-500 text-orange-400"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Request Changes
                </Button>
              </div>
            )}
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
          clientContactId={clientAccess.client_contact_id}
          isClientView={true}
          accessRole={clientAccess.access_role}
        />

        {request.request_type === 'image_review' && (
          <ClientImageReviewGallery
            requestId={requestId}
            clientContactId={clientAccess.client_contact_id}
            requestType={request.request_type}
            accessRole={clientAccess.access_role}
          />
        )}

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
                onClick={(e) => { e.stopPropagation(); document.getElementById('client-image-upload').click(); }}
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
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); document.getElementById('client-file-upload').click(); }}
                disabled={uploadingFile}
                className="border-gray-700"
              >
                {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                Attach File
              </Button>
              <input
                id="client-file-upload"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                onChange={handleFileUpload}
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

      {showRequestDecisionForm && (
        <Dialog open={showRequestDecisionForm} onOpenChange={setShowRequestDecisionForm}>
          <DialogContent className="bg-gray-900 text-white">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                {requestDecisionType === 'approved' ? 'Approve Request' : 'Request Changes'}
              </h3>
              <p className="text-sm text-gray-400">
                Making a decision for: "{request.title}"
              </p>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  {requestDecisionType === 'changes_requested' ? 'Explain what changes are needed *' : 'Add a note (optional)'}
                </label>
                <Textarea
                  value={requestDecisionNote}
                  onChange={(e) => setRequestDecisionNote(e.target.value)}
                  placeholder={requestDecisionType === 'changes_requested' ? 'Describe the changes needed...' : 'Add any comments...'}
                  className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowRequestDecisionForm(false)}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitRequestDecision}
                  disabled={createRequestDecisionMutation.isPending}
                  className={requestDecisionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
                >
                  {createRequestDecisionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    `Submit ${requestDecisionType === 'approved' ? 'Approval' : 'Changes'}`
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}