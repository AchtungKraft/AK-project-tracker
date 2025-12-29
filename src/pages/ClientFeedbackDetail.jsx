import React, { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Upload, Link as LinkIcon, Loader2, Archive, CheckCircle2, AlertCircle, Plus, ExternalLink, X, Paperclip, Trash2, RotateCw, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getRequestState } from "@/components/clientportal/utils";
import ClientFeedbackThread from "../components/clientportal/ClientFeedbackThread.jsx";
import CreateTaskFromApprovalModal from "../components/clientportal/CreateTaskFromApprovalModal.jsx";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ImageModal from "../components/ui/ImageModal";

export default function ClientFeedbackDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('id');
  const projectId = urlParams.get('projectId');

  const [user, setUser] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [visibility, setVisibility] = useState('client_visible');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newLinks, setNewLinks] = useState(['']);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [showRequestDecisionForm, setShowRequestDecisionForm] = useState(false);
  const [requestDecisionType, setRequestDecisionType] = useState('');
  const [requestDecisionNote, setRequestDecisionNote] = useState('');
  const [reviewNewImages, setReviewNewImages] = useState([]);
  const [isUploadingReviewImages, setIsUploadingReviewImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: request } = useQuery({
    queryKey: ['clientFeedbackRequest', requestId],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({ id: requestId }),
    select: (data) => data[0],
    enabled: !!requestId
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['clientFeedbackComments', requestId],
    queryFn: () => base44.entities.ClientFeedbackComment.filter({ request_id: requestId }),
    enabled: !!requestId
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: clientContacts = [] } = useQuery({
    queryKey: ['clientContacts'],
    queryFn: () => base44.entities.ClientContact.list(),
  });

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }),
    select: (data) => data[0],
    enabled: !!projectId
  });

  const { data: linkedTasks = [] } = useQuery({
    queryKey: ['feedbackTaskLinks', requestId],
    queryFn: () => base44.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId }),
    enabled: !!requestId
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['clientFeedbackDecisions', requestId],
    queryFn: () => base44.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
    enabled: !!requestId
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['clientFeedbackAttachments', requestId],
    queryFn: () => base44.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
    enabled: !!requestId
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientFeedbackRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
    }
  });

  const createCommentMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackComment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackComments'] });
      setNewComment('');
      setNewLinks(['']);
      setUploadedPhotos([]);
      setUploadedFiles([]);
    }
  });

  const createAttachmentMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackAttachment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments'] });
    }
  });

  const submitDecisionMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke('publicClientDecision', payload),
    onSuccess: (response) => {
      if (response.data?.success) {
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions', requestId] });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest', requestId] });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments', requestId] });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions', projectId] });
        setRequestDecisionNote('');
        setReviewNewImages([]);
        setShowRequestDecisionForm(false);
        toast.success('Decision recorded');
      } else {
        throw new Error(response.data?.error || 'Failed to record decision');
      }
    },
    onError: (error) => {
      console.error('Decision error:', error);
      toast.error('Failed to record decision');
    }
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async () => {
      const [attachments, comments, decisions, links] = await Promise.all([
      base44.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
      base44.entities.ClientFeedbackComment.filter({ request_id: requestId }),
      base44.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
      base44.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId })]
      );

      await Promise.all([
      ...attachments.map((a) => base44.entities.ClientFeedbackAttachment.delete(a.id)),
      ...comments.map((c) => base44.entities.ClientFeedbackComment.delete(c.id)),
      ...decisions.map((d) => base44.entities.ClientFeedbackDecision.delete(d.id)),
      ...links.map((l) => base44.entities.ClientFeedbackTaskLink.delete(l.id))]
      );

      await base44.entities.ClientFeedbackRequest.delete(requestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackComments'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions'] });
      toast.success('Feedback request deleted');
      navigate(createPageUrl('ProjectDetail') + '?id=' + projectId + '&tab=clientportal');
    }
  });

  const handleDeleteRequest = () => {
    if (!confirm('Delete this feedback request? This will remove its comments, attachments, and decisions.')) return;
    deleteRequestMutation.mutate();
  };

  const handlePostToClient = async () => {
    if (confirm('Post this request to the client? They will be notified.')) {
      const oldStatus = request.status;
      const newStatus = 'posted';
      
      try {
        await base44.functions.invoke('updateRequestStatus', { requestId, status: newStatus });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest'] });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
        
        if (oldStatus !== newStatus) {
          base44.functions.invoke('sendRequestStatusUpdateEmail', { requestId, oldStatus, newStatus });
        }
        base44.functions.invoke('sendNeedsReviewEmail', { requestId });
        toast.success('Request posted to client');
      } catch (error) {
        toast.error('Failed to post request');
      }
    }
  };

  const handleResendForApproval = async () => {
    if (confirm('Resend this request for approval? This will bump it to Needs Review for the client.')) {
      const oldStatus = request.status;
      const newStatus = 'posted';
      
      try {
        await base44.functions.invoke('updateRequestStatus', { requestId, status: newStatus });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest'] });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
        
        if (oldStatus !== newStatus) {
          base44.functions.invoke('sendRequestStatusUpdateEmail', { requestId, oldStatus, newStatus });
        }
        base44.functions.invoke('sendNeedsReviewEmail', { requestId });
        toast.success('Request resent to client');
      } catch (error) {
        toast.error('Failed to resend request');
      }
    }
  };

  const handleArchive = () => {
    if (confirm('Archive this request?')) {
      const oldStatus = request.status;
      const newStatus = 'archived';
      updateRequestMutation.mutate({
        id: requestId,
        data: { status: newStatus }
      }, {
        onSuccess: () => {
          if (oldStatus !== newStatus) {
            base44.functions.invoke('sendRequestStatusUpdateEmail', { requestId, oldStatus, newStatus });
          }
        }
      });
      toast.success('Request archived');
    }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingImages(true);
    try {
      const uploadPromises = files.map((file) =>
      base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map((r) => r.file_url);
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
    setUploadedPhotos(uploadedPhotos.filter((url) => url !== urlToRemove));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    setUploadedFiles(uploadedFiles.filter((f) => f.url !== urlToRemove));
  };

  const handleApproveRequest = () => {
    setRequestDecisionType('approved');
    setShowRequestDecisionForm(true);
  };

  const handleRequestChangesRequest = () => {
    setRequestDecisionType('changes_requested');
    setShowRequestDecisionForm(true);
  };

  const handleSubmitRequestDecision = (payload) => {
    if (payload.decision === 'changes_requested' && !payload.note?.trim()) {
      toast.error('Please provide a note explaining the requested changes');
      return;
    }

    if (!user) {
      toast.error('User not authenticated.');
      return;
    }

    submitDecisionMutation.mutate({
      ...payload,
      newImages: payload.newImages || reviewNewImages // Use passed newImages or default to reviewNewImages state
    });
  };

  const handleAddComment = async () => {
    if (!newComment.trim() && newLinks.every((l) => !l.trim()) && uploadedPhotos.length === 0 && uploadedFiles.length === 0) {
      toast.error('Please enter a comment, add a link, or attach a file');
      return;
    }

    if (!user) {
      toast.error('User not authenticated.');
      return;
    }

    try {
      const response = await base44.functions.invoke('addInternalComment', {
        requestId,
        body: newComment,
        visibility,
        photos: uploadedPhotos,
        files: uploadedFiles,
        links: newLinks
      });

      if (response.data?.success) {
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackComments'] });
        queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments'] });
        setNewComment('');
        setNewLinks(['']);
        setUploadedPhotos([]);
        setUploadedFiles([]);
        toast.success('Comment added');
      } else {
        throw new Error(response.data?.error || 'Failed to add comment');
      }
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const linkedTaskDetails = linkedTasks.map((link) => {
    const task = tasks.find((t) => t.id === link.task_id);
    return task ? { ...link, task } : null;
  }).filter(Boolean);

  const requestState = request ? getRequestState(request, decisions, attachments) : null;

  // Determine button labels based on request type
  const approveLabel = request?.request_type === 'image_review' ? 'Approve' : 'Confirm';
  const requestChangesLabel = 'Request Changes';

  if (!request || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>);

  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(createPageUrl("ProjectDetail") + "?id=" + projectId + "&tab=clientportal")}
              className="border-gray-700 text-white">

              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{request.title}</h1>
              {project && <p className="text-sm text-gray-400">{project.name}</p>}
            </div>

            {request.status === 'posted' && request.request_type !== 'image_review' &&
            <div className="flex gap-2">
                <Button
                size="sm"
                onClick={() => handleSubmitRequestDecision({
                  requestId,
                  decision: 'approved',
                  note: '',
                  targetAttachmentIds: null,
                  newImages: reviewNewImages,
                })}
                className="bg-green-600 hover:bg-green-700 text-white border-green-600">

                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {approveLabel}
                </Button>
                <Button
                size="sm"
                onClick={handleRequestChangesRequest}
                className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600">

                  <AlertCircle className="w-4 h-4 mr-1" />
                  {requestChangesLabel}
                </Button>
              </div>
            }

          </div>

          <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="border-gray-600 text-gray-200">
                    {request.request_type === 'image_review' ? 'Design Review' : request.request_type.replace('_', ' ')}
                  </Badge>
                  {requestState && (
                    <Badge className={cn("flex items-center gap-1", requestState.color)}>
                      <requestState.icon className="w-3 h-3" />
                      {requestState.label}
                    </Badge>
                  )}
                  {request.due_date &&
                  <Badge variant="outline" className="border-gray-600 text-gray-200">
                      Due: {format(new Date(request.due_date), 'MMM d, yyyy')}
                    </Badge>
                  }
                </div>
                <div className="flex gap-2">
                  {request.status === 'draft' &&
                  <Button size="sm" onClick={handlePostToClient} className="bg-blue-600 hover:bg-blue-700">
                      Post to Client
                    </Button>
                  }
                  {['posted', 'changes_requested', 'approved'].includes(request.status) &&
                  <>
                    <Button size="sm" onClick={handleResendForApproval} variant="outline" className="bg-purple-100 text-purple-900 border-purple-200 hover:bg-purple-200 hover:text-purple-950 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm h-8">
                      <RotateCw className="w-4 h-4 mr-1" />
                      Resend
                    </Button>
                    <Button size="sm" onClick={handleArchive} variant="outline" className="bg-sky-100 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-8 border-gray-700">
                      <Archive className="w-4 h-4 mr-1" />
                      Archive
                    </Button>
                  </>
                  }
                  {request.status === 'archived' && (
                    <Button size="sm" onClick={() => {
                      if (confirm('Move this request back to draft?')) {
                        const oldStatus = request.status;
                        const newStatus = 'draft';
                        updateRequestMutation.mutate({
                          id: requestId,
                          data: { status: newStatus }
                        }, {
                          onSuccess: () => {
                            if (oldStatus !== newStatus) {
                               base44.functions.invoke('sendRequestStatusUpdateEmail', { requestId, oldStatus, newStatus });
                            }
                          }
                        });
                        toast.success('Moved to Drafts');
                      }
                    }} variant="outline" className="bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors border h-8">
                      <FileText className="w-4 h-4 mr-1" />
                      Move to Draft
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleDeleteRequest}
                    disabled={deleteRequestMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white border-red-600">

                    {deleteRequestMutation.isPending ?
                    <Loader2 className="w-4 h-4 animate-spin" /> :

                    <Trash2 className="w-4 h-4 mr-1" />
                    }
                    Delete
                  </Button>
                </div>
              </div>

              {request.body &&
              <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-300 whitespace-pre-wrap">{request.body}</p>
                </div>
              }

              {linkedTaskDetails.length > 0 &&
              <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Linked Tasks</h3>
                  <div className="space-y-2">
                    {linkedTaskDetails.map(({ task }) =>
                  <div key={task.id} className="bg-gray-800/50 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-white text-sm">{task.name}</span>
                        <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigate(createPageUrl("ProjectDetail") + "?id=" + projectId + "&tab=tasks");
                      }}
                      className="text-blue-400 hover:text-blue-300">

                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                  )}
                  </div>
                </div>
              }
            </CardContent>
          </Card>

          <ClientFeedbackThread
            requestId={requestId}
            userId={user.id}
            requestType={request.request_type}
            onCreateTask={(approval) => {
              setSelectedApproval(approval);
              setShowCreateTaskModal(true);
            }}
            onDecisionSubmit={handleSubmitRequestDecision}
            isClientView={false}
            accessRole={user?.role}
            request={{
              ...request,
              creator: users.find(u => u.id === request.created_by_user_id),
              comments: comments.map(c => ({
                ...c,
                author: c.author_type === 'internal_user'
                  ? users.find(u => u.id === c.author_id)
                  : clientContacts.find(cc => cc.id === c.author_id)
              })),
              decisions: decisions.map(d => ({
                ...d,
                decider: d.decided_by_type === 'internal_user'
                  ? users.find(u => u.id === d.decided_by_id)
                  : clientContacts.find(cc => cc.id === d.decided_by_id)
              })),
              attachments: attachments.map(a => ({
                ...a,
                creator: a.created_by_type === 'internal_user'
                  ? users.find(u => u.id === a.created_by_id)
                  : clientContacts.find(cc => cc.id === a.created_by_id)
              }))
            }} />


          <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Add Comment</h3>
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_visible">Client Visible</SelectItem>
                    <SelectItem value="internal_only">Internal Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]" />


              {uploadedPhotos.length > 0 &&
              <div>
                  <Label className="text-xs text-gray-400 mb-2 block">Attached Images ({uploadedPhotos.length})</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {uploadedPhotos.map((url, idx) =>
                  <div key={idx} className="relative group">
                        <div className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden">
                          <img
                        src={url}
                        alt={`Upload ${idx + 1}`}
                        className="max-w-full max-h-full object-contain" />

                        </div>
                        <button
                      type="button"
                      onClick={() => handleRemovePhoto(url)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">

                          <X className="w-3 h-3" />
                        </button>
                      </div>
                  )}
                  </div>
                </div>
              }

              {uploadedFiles.length > 0 &&
              <div>
                  <Label className="text-xs text-gray-400 mb-2 block">Attached Files ({uploadedFiles.length})</Label>
                  <div className="space-y-2">
                    {uploadedFiles.map((file, idx) =>
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
                        <span className="text-white text-sm truncate">{file.name}</span>
                        <button
                      type="button"
                      onClick={() => handleRemoveFile(file.url)}
                      className="text-red-400 hover:text-red-300 p-1">

                          <X className="w-4 h-4" />
                        </button>
                      </div>
                  )}
                  </div>
                </div>
              }

              <div className="space-y-2">
                <Label className="text-xs text-gray-400">Add Links (optional)</Label>
                {newLinks.map((link, idx) =>
                <div key={idx} className="flex gap-2">
                    <Input
                    value={link}
                    onChange={(e) => {
                      const updated = [...newLinks];
                      updated[idx] = e.target.value;
                      setNewLinks(updated);
                    }}
                    placeholder="https://..."
                    className="bg-gray-800 border-gray-700 text-white" />

                    {idx === newLinks.length - 1 &&
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setNewLinks([...newLinks, ''])}
                    className="border-gray-700">

                        <Plus className="w-4 h-4" />
                      </Button>
                  }
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="internal-image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden" />

                <label htmlFor="internal-image-upload">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingImages} className="bg-red-700 text-slate-50 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-8 border-gray-700 cursor-pointer"

                    onClick={() => document.getElementById('internal-image-upload').click()}>

                    {uploadingImages ?
                    <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Uploading...
                      </> :

                    <>
                        <Upload className="w-4 h-4 mr-1" />
                        Add Images
                      </>
                    }
                  </Button>
                </label>

                <input
                  id="internal-file-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                  onChange={handleFileUpload}
                  className="hidden" />

                <label htmlFor="internal-file-upload">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingFile} className="bg-amber-500 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-8 border-gray-700 cursor-pointer"

                    onClick={() => document.getElementById('internal-file-upload').click()}>

                    {uploadingFile ?
                    <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Uploading...
                      </> :

                    <>
                        <Paperclip className="w-4 h-4 mr-1" />
                        Attach File
                      </>
                    }
                  </Button>
                </label>


                <Button
                  onClick={handleAddComment}
                  disabled={createCommentMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white ml-auto">

                  {createCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showRequestDecisionForm &&
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
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]" />

              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">Upload Reference Images (Optional)</label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md transition-colors text-sm text-gray-300">
                      {isUploadingReviewImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Upload Images
                    </div>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length === 0) return;
                        
                        setIsUploadingReviewImages(true);
                        try {
                          const uploadPromises = files.map(file => base44.integrations.Core.UploadFile({ file }));
                          const results = await Promise.all(uploadPromises);
                          const urls = results.map(r => r.file_url);
                          setReviewNewImages(prev => [...prev, ...urls]);
                          toast.success('Images uploaded');
                        } catch (error) {
                          console.error(error);
                          toast.error('Failed to upload images');
                        } finally {
                          setIsUploadingReviewImages(false);
                        }
                      }}
                      disabled={isUploadingReviewImages} 
                    />
                  </label>
                  <span className="text-xs text-gray-500">{reviewNewImages.length} images added</span>
                </div>
                
                {reviewNewImages.length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                    {reviewNewImages.map((url, idx) => (
                      <div key={idx} className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden border border-gray-700">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setReviewNewImages(prev => prev.filter(u => u !== url))}
                          className="absolute top-0 right-0 bg-red-600 text-white p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                variant="outline"
                onClick={() => setShowRequestDecisionForm(false)}
                className="border-gray-600 text-gray-200 hover:bg-gray-800">

                  Cancel
                </Button>
                <Button
                onClick={() => handleSubmitRequestDecision({
                  requestId,
                  decision: requestDecisionType,
                  note: requestDecisionNote,
                  targetAttachmentIds: null,
                  newImages: reviewNewImages, // From modal upload
                })}
                disabled={submitDecisionMutation.isPending}
                className={requestDecisionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}>

                  {submitDecisionMutation.isPending ?
                <Loader2 className="w-4 h-4 animate-spin" /> :

                `Submit ${requestDecisionType === 'approved' ? approveLabel : 'Changes'}`
                }
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }

      {showCreateTaskModal &&
      <CreateTaskFromApprovalModal
        open={showCreateTaskModal}
        onClose={() => {
          setShowCreateTaskModal(false);
          setSelectedApproval(null);
        }}
        projectId={projectId}
        requestId={requestId}
        approval={selectedApproval}
        userId={user.id} />

      }

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>);

}