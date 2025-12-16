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
import { ArrowLeft, Send, Upload, Link as LinkIcon, Loader2, Archive, CheckCircle2, AlertCircle, Plus, ExternalLink } from "lucide-react";
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
  const [uploadingImages, setUploadingImages] = useState(false);
  const [newLinks, setNewLinks] = useState(['']);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: request } = useQuery({
    queryKey: ['clientFeedbackRequest', requestId],
    queryFn: () => base44.entities.ClientFeedbackRequest.filter({ id: requestId }),
    select: (data) => data[0],
    enabled: !!requestId,
  });

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }),
    select: (data) => data[0],
    enabled: !!projectId,
  });

  const { data: linkedTasks = [] } = useQuery({
    queryKey: ['feedbackTaskLinks', requestId],
    queryFn: () => base44.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId }),
    enabled: !!requestId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientFeedbackRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequests'] });
    },
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

  const handlePostToClient = () => {
    if (confirm('Post this request to the client? They will be notified.')) {
      updateRequestMutation.mutate({
        id: requestId,
        data: { status: 'posted', posted_at: new Date().toISOString() },
      });
      toast.success('Request posted to client');
    }
  };

  const handleArchive = () => {
    if (confirm('Archive this request?')) {
      updateRequestMutation.mutate({
        id: requestId,
        data: { status: 'archived' },
      });
      toast.success('Request archived');
    }
  };

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
          created_by_type: 'internal_user',
          created_by_id: user.id,
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
        author_type: 'internal_user',
        author_id: user.id,
        body: newComment,
        visibility,
        target_type: 'request',
      });

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

  const linkedTaskDetails = linkedTasks.map(link => {
    const task = tasks.find(t => t.id === link.task_id);
    return task ? { ...link, task } : null;
  }).filter(Boolean);

  if (!request || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
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
              className="border-gray-700 text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{request.title}</h1>
              {project && <p className="text-sm text-gray-400">{project.name}</p>}
            </div>
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
                  {request.due_date && (
                    <Badge variant="outline">
                      Due: {format(new Date(request.due_date), 'MMM d, yyyy')}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {request.status === 'draft' && (
                    <Button size="sm" onClick={handlePostToClient} className="bg-blue-600 hover:bg-blue-700">
                      Post to Client
                    </Button>
                  )}
                  {request.status === 'posted' && (
                    <Button size="sm" onClick={handleArchive} variant="outline" className="border-gray-700">
                      <Archive className="w-4 h-4 mr-1" />
                      Archive
                    </Button>
                  )}
                </div>
              </div>

              {request.body && (
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-gray-300 whitespace-pre-wrap">{request.body}</p>
                </div>
              )}

              {linkedTaskDetails.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Linked Tasks</h3>
                  <div className="space-y-2">
                    {linkedTaskDetails.map(({ task }) => (
                      <div key={task.id} className="bg-gray-800/50 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-white text-sm">{task.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigate(createPageUrl("ProjectDetail") + "?id=" + projectId + "&tab=tasks");
                          }}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <FeedbackRequestThread
            requestId={requestId}
            userId={user.id}
            onCreateTask={(approval) => {
              setSelectedApproval(approval);
              setShowCreateTaskModal(true);
            }}
          />

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
                  onClick={() => document.getElementById('image-upload').click()}
                  disabled={uploadingImages}
                  className="border-gray-700"
                >
                  {uploadingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                  Upload Images
                </Button>
                <input
                  id="image-upload"
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

      {showCreateTaskModal && (
        <CreateTaskFromApprovalModal
          open={showCreateTaskModal}
          onClose={() => {
            setShowCreateTaskModal(false);
            setSelectedApproval(null);
          }}
          projectId={projectId}
          requestId={requestId}
          approval={selectedApproval}
          userId={user.id}
        />
      )}
    </>
  );
}