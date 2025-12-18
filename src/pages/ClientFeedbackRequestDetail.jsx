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
import { ArrowLeft, Send, Upload, Plus, Loader2, CheckCircle2, AlertCircle, X, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ClientFeedbackThread from "../components/clientportal/ClientFeedbackThread.jsx";
import { cn } from "@/lib/utils";
import { getRequestState } from "@/components/clientportal/utils";

const getRequestTypeInfo = (type) => {
  const map = {
    question: { label: 'Question', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border' },
    update: { label: 'Update', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50 border' },
    image_review: { label: 'Design Review', color: 'bg-purple-500/20 text-purple-400 border-purple-500/50 border' },
    approval: { label: 'Need from Client', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50 border' },
  };
  return map[type] || { label: type.replace('_', ' '), color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border' };
};

export default function ClientFeedbackRequestDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('id');
  const token = urlParams.get('token');
  const slug = urlParams.get('slug');

  const [clientAccess, setClientAccess] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newLinks, setNewLinks] = useState(['']);
  const [showRequestDecisionForm, setShowRequestDecisionForm] = useState(false);
  const [requestDecisionType, setRequestDecisionType] = useState('');
  const [requestDecisionNote, setRequestDecisionNote] = useState('');

  useEffect(() => {
    if (!token && !slug || !requestId) return;

    base44.functions.invoke('publicClientRequestDetail', { token, slug, requestId })
      .then(response => {
        if (response.data.success) {
          setClientAccess(response.data.access);
        }
      })
      .catch(error => {
        console.error('Failed to load request data:', error);
      });
  }, [token, slug, requestId]);

  const { data: requestData } = useQuery({
    queryKey: ['clientRequestDetail', token, slug, requestId],
    queryFn: async () => {
      const response = await base44.functions.invoke('publicClientRequestDetail', { token, slug, requestId });
      return response.data;
    },
    enabled: !!requestId && !!clientAccess,
  });

  const request = requestData?.request;
  const decisions = requestData?.decisions || [];
  const attachments = requestData?.attachments || [];

  const createCommentMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('publicAddClientComment', {
        token,
        slug,
        requestId,
        comment: data.body,
        attachments: data.attachments || []
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientRequestDetail', token, slug, requestId] });
      setNewComment('');
      setNewLinks(['']);
      setUploadedPhotos([]);
      setUploadedFiles([]);
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
      const uploadPromises = files.map(file =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map(r => r.file_url);
      
      setUploadedPhotos([...uploadedPhotos, ...photoUrls]);
      toast.success('Images uploaded');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload images');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    setUploadedPhotos(uploadedPhotos.filter(url => url !== urlToRemove));
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
      setUploadedFiles([...uploadedFiles, { name: file.name, url: file_url }]);
      toast.success('File uploaded');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleRemoveFile = (urlToRemove) => {
    setUploadedFiles(uploadedFiles.filter(f => f.url !== urlToRemove));
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
      await base44.functions.invoke('publicClientDecision', {
        token,
        slug,
        requestId,
        decision: requestDecisionType,
        note: requestDecisionNote,
        targetAttachmentIds: null,
        newImages: []
      });

      queryClient.invalidateQueries({ queryKey: ['clientRequestDetail', token, slug, requestId] });
      setRequestDecisionNote('');
      setShowRequestDecisionForm(false);
      toast.success('Decision recorded');
    } catch (error) {
      console.error('Decision error:', error);
      toast.error('Failed to record decision');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() && newLinks.every(l => !l.trim()) && uploadedPhotos.length === 0 && uploadedFiles.length === 0) {
      toast.error('Please enter a comment, add a link, or attach a file');
      return;
    }

    try {
      const attachments = [];

      // Add photos
      uploadedPhotos.forEach(url => {
        attachments.push({
          attachment_type: 'image',
          file_url: url
        });
      });

      // Add files
      uploadedFiles.forEach(file => {
        attachments.push({
          attachment_type: 'file',
          file_url: file.url,
          label: file.name
        });
      });

      // Add links
      newLinks.forEach(link => {
        if (link.trim()) {
          attachments.push({
            attachment_type: 'link',
            link_url: link.trim()
          });
        }
      });

      await createCommentMutation.mutateAsync({
        body: newComment,
        attachments
      });

      toast.success('Comment added');
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const requestState = request ? getRequestState(request, decisions, attachments) : null;
  const approveLabel = request?.request_type === 'image_review' ? 'Approve' : 'Confirm';

  if ((!token && !slug) || !clientAccess || !request) {
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
            onClick={() => navigate(createPageUrl("ClientProjectPortal") + `?projectId=${request.project_id}&` + (slug ? `slug=${slug}` : `token=${token}`))}
            className="border-gray-700 text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{request.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={cn("text-xs border", getRequestTypeInfo(request.request_type).color)}>
                {getRequestTypeInfo(request.request_type).label}
              </Badge>
              {requestState && (
                <Badge className={cn("flex items-center gap-1", requestState.color)}>
                  <requestState.icon className="w-3 h-3" />
                  {requestState.label}
                </Badge>
              )}
              {request.due_date && (
                <Badge variant="outline" className="text-xs border-gray-600 text-gray-200">
                  Due: {format(new Date(request.due_date), 'MMM d, yyyy')}
                </Badge>
              )}
            </div>

            {clientAccess?.access_role === 'approver' && request.status === 'posted' && request.request_type !== 'image_review' && (
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={handleApproveRequest}
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {approveLabel}
                </Button>
                <Button
                  size="sm"
                  onClick={handleRequestChangesRequest}
                  className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
                >
                  <AlertCircle className="w-4 h-4 mr-1" />
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
          requestType={request.request_type}
          accessRole={clientAccess.access_role}
          token={token}
          slug={slug}
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

            {uploadedPhotos.length > 0 && (
              <div>
                <Label className="text-xs text-gray-400 mb-2 block">Attached Images ({uploadedPhotos.length})</Label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {uploadedPhotos.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <div className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden">
                        <img
                          src={url}
                          alt={`Upload ${idx + 1}`}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(url)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadedFiles.length > 0 && (
              <div>
                <Label className="text-xs text-gray-400 mb-2 block">Attached Files ({uploadedFiles.length})</Label>
                <div className="space-y-2">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
                      <span className="text-white text-sm truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(file.url)}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              <input
                id="client-image-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <label htmlFor="client-image-upload">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingImages}
                  className="border-gray-700 cursor-pointer"
                  onClick={() => document.getElementById('client-image-upload').click()}
                >
                  {uploadingImages ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-1" />
                      Add Images
                    </>
                  )}
                </Button>
              </label>

              <input
                id="client-file-upload"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="client-file-upload">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingFile}
                  className="border-gray-700 cursor-pointer"
                  onClick={() => document.getElementById('client-file-upload').click()}
                >
                  {uploadingFile ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Paperclip className="w-4 h-4 mr-1" />
                      Attach File
                    </>
                  )}
                </Button>
              </label>

              <Button
                onClick={handleAddComment}
                disabled={createCommentMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white ml-auto"
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
                {requestDecisionType === 'approved' ? `${approveLabel} Request` : 'Request Changes'}
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
                  className="border-gray-600 text-gray-200 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitRequestDecision}
                  className={requestDecisionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
                >
                  {`Submit ${requestDecisionType === 'approved' ? approveLabel : 'Changes'}`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}