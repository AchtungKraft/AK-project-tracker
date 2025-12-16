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
import { ArrowLeft, Send, Upload, Link as LinkIcon, Loader2, Archive, CheckCircle2, AlertCircle, Plus, ExternalLink, X, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FeedbackRequestThread from "../components/clientportal/FeedbackRequestThread.jsx";
import CreateTaskFromApprovalModal from "../components/clientportal/CreateTaskFromApprovalModal.jsx";

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

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: request } = useQuery({
    queryKey: ['clientFeedbackRequest', requestId],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({ id: requestId }),
    select: (data) => data[0],
    enabled: !!requestId
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

  const createRequestDecisionMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackDecision.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
      setRequestDecisionNote('');
      setShowRequestDecisionForm(false);
      toast.success('Decision recorded');
    },
  });

  const handlePostToClient = () => {
    if (confirm('Post this request to the client? They will be notified.')) {
      updateRequestMutation.mutate({
        id: requestId,
        data: { status: 'posted', posted_at: new Date().toISOString() }
      });
      toast.success('Request posted to client');
    }
  };

  const handleArchive = () => {
    if (confirm('Archive this request?')) {
      updateRequestMutation.mutate({
        id: requestId,
        data: { status: 'archived' }
      });
      toast.success('Request archived');
    }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

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

    if (!user) {
      toast.error('User not authenticated.');
      return;
    }

    try {
      await createRequestDecisionMutation.mutateAsync({
        request_id: requestId,
        decided_by_type: 'internal_user',
        decided_by_id: user.id,
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
    if (!newComment.trim() && newLinks.every((l) => !l.trim()) && uploadedPhotos.length === 0 && uploadedFiles.length === 0) {
      toast.error('Please enter a comment, add a link, or attach a file');
      return;
    }

    if (!user) {
      toast.error('User not authenticated.');
      return;
    }

    try {
      const comment = await createCommentMutation.mutateAsync({
        request_id: requestId,
        author_type: 'internal_user',
        author_id: user.id,
        body: newComment,
        visibility,
        target_type: 'request'
      });

      for (const photoUrl of uploadedPhotos) {
        await createAttachmentMutation.mutateAsync({
          request_id: requestId,
          comment_id: comment.id,
          attachment_type: 'image',
          file_url: photoUrl,
          created_by_type: 'internal_user',
          created_by_id: user.id,
        });
      }

      for (const file of uploadedFiles) {
        await createAttachmentMutation.mutateAsync({
          request_id: requestId,
          comment_id: comment.id,
          attachment_type: 'file',
          file_url: file.url,
          label: file.name,
          created_by_type: 'internal_user',
          created_by_id: user.id,
        });
      }

      for (const link of newLinks) {
        if (link.trim()) {
          await createAttachmentMutation.mutateAsync({
            request_id: requestId,
            comment_id: comment.id,
            attachment_type: 'link',
            link_url: link.trim(),
            created_by_type: 'internal_user',
            created_by_id: user.id,
          });
        }
      }

      toast.success('Comment added');
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const linkedTaskDetails = linkedTasks.map((link) => {
    const task = tasks.find((t) => t.id === link.task_id);
    return task ? { ...link, task } : null;
  }).filter(Boolean);

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

            {request.status === 'posted' && request.request_type !== 'image_review' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleApproveRequest}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  onClick={handleRequestChangesRequest}
                  variant="outline"
                  className="border-orange-500 text-orange-400"
                >
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Request Changes
                </Button>
              </div>
            )}

          </div>

          <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{request.request_type.replace('_', ' ')}</Badge>
                  <Badge className={cn(
                    request.status === 'draft' ? 'bg-gray-500' :
                    request.status === 'posted' ? 'bg-blue-500' :
                    'bg-gray-400'
                  )}>
                    {request.status}
                  </Badge>
                  {request.due_date &&
                  <Badge variant="outline">
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
                  {request.status === 'posted' &&
                  <Button size="sm" onClick={handleArchive} variant="outline" className="border-gray-700">
                      <Archive className="w-4 h-4 mr-1" />
                      Archive
                    </Button>
                  }
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

          <FeedbackRequestThread
            requestId={requestId}
            userId={user.id}
            onCreateTask={(approval) => {
              setSelectedApproval(approval);
              setShowCreateTaskModal(true);
            }}
            isClientView={false}
            accessRole={user?.role}
          />

          {request.request_type === 'image_review' && (
            <ClientImageReviewGallery
              requestId={requestId}
              userId={user.id}
              requestType={request.request_type}
              accessRole={user?.role}
            />
          )}


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
                  className="hidden"
                />
                <label htmlFor="internal-image-upload">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingImages}
                    className="border-gray-700 cursor-pointer"
                    onClick={() => document.getElementById('internal-image-upload').click()}
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
                  id="internal-file-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="internal-file-upload">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingFile}
                    className="border-gray-700 cursor-pointer"
                    onClick={() => document.getElementById('internal-file-upload').click()}
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
                  className="bg-red-600 hover:bg-red-700 ml-auto">

                  {createCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
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
    </>);

}