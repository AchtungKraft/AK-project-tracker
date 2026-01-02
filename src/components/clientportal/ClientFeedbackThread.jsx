import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertCircle, Link as LinkIcon, FileText, Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ImageModal from "../ui/ImageModal";

export default function ClientFeedbackThread({ requestId, clientContactId, isClientView, userId, accessRole, requestType, token, slug, request, onDecisionSubmit }) {
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewNewImages, setReviewNewImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);



  // Get comments, decisions, and attachments from props (passed from parent)
  const comments = request?.comments || [];
  const decisions = request?.decisions || [];
  const attachments = request?.attachments || [];

  const timeline = useMemo(() => {
    const events = [];

    // Find earliest decision time to separate initial attachments from decision reference images
    const earliestDecisionTime = decisions.length > 0
      ? Math.min(...decisions.map(d => new Date(d.decided_at || d.created_date).getTime()))
      : Infinity;

    // Track which attachment IDs are associated with decisions (to exclude from initial request)
    const decisionAttachmentIds = new Set();
    
    // Build a map of decision times by creator for matching reference attachments
    const decisionTimesByCreator = {};
    decisions.forEach(d => {
      const key = `${d.decided_by_type}_${d.decided_by_id}`;
      const time = new Date(d.decided_at || d.created_date).getTime();
      if (!decisionTimesByCreator[key]) {
        decisionTimesByCreator[key] = [];
      }
      decisionTimesByCreator[key].push(time);
    });

    // Pre-identify which attachments belong to decisions (uploaded within 5 seconds of a decision by same creator)
    attachments.forEach(a => {
      if (a.comment_id) return;
      const attachmentTime = new Date(a.posted_at || a.created_date).getTime();
      const creatorKey = `${a.created_by_type}_${a.created_by_id}`;
      const creatorDecisionTimes = decisionTimesByCreator[creatorKey] || [];
      
      // Check if this attachment was uploaded close to any decision by this creator
      const isDecisionAttachment = creatorDecisionTimes.some(dt => Math.abs(attachmentTime - dt) < 5000);
      if (isDecisionAttachment) {
        decisionAttachmentIds.add(a.id);
      }
    });

    // Initial request attachments: created by internal users, not linked to comments, not decision-related, and uploaded BEFORE any decisions
    const requestAttachments = attachments.filter(a => {
      if (a.comment_id) return false;
      if (decisionAttachmentIds.has(a.id)) return false;
      // Only include attachments from internal users as initial design images
      if (a.created_by_type !== 'internal_user') return false;
      // Must be uploaded before any decisions were made
      const attachmentTime = new Date(a.posted_at || a.created_date).getTime();
      return attachmentTime < earliestDecisionTime;
    });

    if (requestAttachments.length > 0 || request?.posted_at) {
      const timestamp = request?.posted_at || request?.created_date;
      events.push({
        type: 'request_post',
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        message: 'Review Started',
        attachments: requestAttachments,
        creator: request?.creator,
      });
    }

    const visibleComments = isClientView
      ? comments.filter(c => c.visibility === 'client_visible')
      : comments;

    // Add standalone comments (not associated with decisions)
    // Filter out any comments that have a matching decision with the same timestamp and author
    visibleComments.forEach(comment => {
      const commentTime = new Date(comment.posted_at || comment.created_date).getTime();
      const commentAuthorId = comment.author_id;
      const commentAuthorType = comment.author_type;
      
      // Check if there's a decision that matches this comment (same author, within 2 seconds)
      const hasMatchingDecision = decisions.some(decision => {
        const decisionTime = new Date(decision.decided_at || decision.created_date).getTime();
        return decision.decided_by_id === commentAuthorId &&
               decision.decided_by_type === commentAuthorType &&
               Math.abs(decisionTime - commentTime) < 2000;
      });
      
      // Only add comment if it doesn't have a matching decision (avoid duplicates)
      if (!hasMatchingDecision) {
        const commentAttachments = attachments.filter(a => a.comment_id === comment.id);

        events.push({
          type: 'comment',
          timestamp: new Date(comment.posted_at || comment.created_date),
          comment,
          author: comment.author,
          attachments: commentAttachments,
        });
      }
    });

    // Group decisions by timestamp and decider to handle batch reviews
    const decisionGroups = {};

    decisions.forEach(decision => {
      const timestampStr = decision.decided_at || decision.created_date;
      const timestamp = new Date(timestampStr);
      const roundedTime = Math.floor(timestamp.getTime() / 1000);
      const key = `${decision.decided_by_type}_${decision.decided_by_id}_${roundedTime}`;
      if (!decisionGroups[key]) {
        decisionGroups[key] = [];
      }
      decisionGroups[key].push(decision);
    });

    Object.values(decisionGroups).forEach(group => {
      const firstDecision = group[0];
      const decider = firstDecision.decider;
      const decisionTime = new Date(firstDecision.decided_at || firstDecision.created_date).getTime();

      // Get reference attachments created by the decider within 5 seconds of the decision
      // Match ONLY by creator and time proximity
      const referenceAttachments = attachments.filter(a => {
        if (a.comment_id) return false; // Skip attachments linked to comments

        const attachmentTime = new Date(a.posted_at || a.created_date).getTime();
        const timeDiff = Math.abs(attachmentTime - decisionTime);

        // Match by creator and time proximity
        const attachmentCreatorType = a.created_by_type;
        const attachmentCreatorId = a.created_by_id;
        const decisionCreatorType = firstDecision.decided_by_type;
        const decisionCreatorId = firstDecision.decided_by_id;

        const creatorTypeMatches = attachmentCreatorType === decisionCreatorType;
        const creatorIdMatches = attachmentCreatorId === decisionCreatorId;
        const timeMatches = timeDiff < 5000; // 5 second window

        return creatorTypeMatches && creatorIdMatches && timeMatches;
      });

      // Get the selected/reviewed images
      const selectedImageDecisions = group.filter(d => d.target_type === 'attachment_image');

      const selectedImages = selectedImageDecisions.map(d => {
        if (d.target_image_url) {
          return {
            id: d.target_attachment_id || d.id,
            file_url: d.target_image_url,
            attachment_type: 'image',
            decision: d.decision
          };
        } else if (d.target_attachment_id) {
          const attachment = attachments.find(a => a.id === d.target_attachment_id);
          if (attachment) {
            return {
              id: attachment.id,
              file_url: attachment.file_url,
              attachment_type: 'image',
              decision: d.decision
            };
          }
        }
        return null;
      }).filter(Boolean);

      const timestampStr = firstDecision.decided_at || firstDecision.created_date;
      events.push({
        type: 'decision',
        timestamp: new Date(timestampStr),
        decision: firstDecision,
        decider,
        referenceAttachments,
        selectedImages,
        groupedDecisions: group,
      });
    });

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [comments, decisions, attachments, isClientView, request]);

  const handleImageSelect = (imageId) => {
    setSelectedImageIds(prev => {
      if (prev.includes(imageId)) {
        return prev.filter(id => id !== imageId);
      }
      return [...prev, imageId];
    });
  };

  const handleReviewAction = (action) => {
    setReviewAction(action);
    setIsReviewing(true);
  };

  const handleReviewImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setIsUploading(true);
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
      setIsUploading(false);
    }
  };

  const handleSubmitReview = async () => {
  if (reviewAction === 'changes_requested' && !reviewNote.trim()) {
  toast.error('Please provide a note for changes requested');
  return;
  }

  setIsSubmitting(true);
  try {
  const payload = {
    requestId: requestId,
    decision: reviewAction,
    note: reviewNote,
    targetAttachmentIds: selectedImageIds.length > 0 ? selectedImageIds : null,
    newImages: reviewNewImages,
  };

  // Use the onDecisionSubmit prop if provided (for internal page)
  if (onDecisionSubmit) {
    await onDecisionSubmit(payload);
  } else {
    // Fallback to direct backend function invocation (for public client portal)
    if (token) payload.token = token;
    if (slug) payload.slug = slug;
    const response = await base44.functions.invoke('publicClientDecision', payload);
    if (response.data?.success) {
      // Invalidate client portal specific queries
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackComments', requestId] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions', requestId] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments', requestId] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackRequest', requestId] });
      if (token || slug) {
        queryClient.invalidateQueries({ queryKey: ['clientRequestDetail', token, slug, requestId] });
      }
    } else {
      throw new Error(response.data?.error || 'Failed to submit review');
    }
  }

  toast.success('Review submitted');
  setSelectedImageIds([]);
  setReviewNewImages([]);
  setReviewNote("");
  setIsReviewing(false);
  setReviewAction(null);

  } catch (error) {
  console.error(error);
  toast.error(error.message || 'Failed to submit review');
  } finally {
  setIsSubmitting(false);
  }
  };

  const canReview = (accessRole === 'approver' && isClientView) || (!isClientView && userId);

  return (
    <>
      <div className="space-y-6 pb-20">
        {timeline.map((event, idx) => (
          <Card key={idx} className="bg-black/60 backdrop-blur-xl border border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                {event.type === 'request_post' && (
                  <div className="flex items-center gap-2 text-blue-400">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/50">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {event.creator?.full_name || 'Team'} posted review request
                      </p>
                      <p className="text-xs text-gray-400">{format(event.timestamp, 'MMM d, h:mm a')}</p>
                    </div>
                  </div>
                )}

                {event.type === 'comment' && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                      <span className="text-white font-bold text-xs">
                        {event.author?.name?.[0] || event.author?.full_name?.[0] || 'U'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">
                        {event.author?.name || event.author?.full_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {format(event.timestamp, 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                )}

                {event.type === 'decision' && (
                  <div className="flex items-center gap-2 text-white">
                    {event.decision.decision === 'approved' ? <CheckCircle2 className="text-green-500" /> : <AlertCircle className="text-orange-500" />}
                    <div>
                      <p className="font-medium text-sm">
                        {event.decider?.name || event.decider?.full_name} {event.decision.decision === 'approved' ? 'Approved' : 'Requested Changes'}
                      </p>
                      <p className="text-xs text-gray-400">{format(event.timestamp, 'MMM d, h:mm a')}</p>
                    </div>
                  </div>
                )}
              </div>

              {event.comment?.body && (
                <p className="text-gray-300 whitespace-pre-wrap mb-3 pl-10">{event.comment.body}</p>
              )}
              {event.decision?.note && (
                <p className="text-gray-300 whitespace-pre-wrap mb-3 pl-10">{event.decision.note}</p>
              )}

              {event.type === 'decision' && event.selectedImages?.length > 0 && (
                <div className="pl-10 space-y-3 mb-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Reviewed Images ({event.selectedImages.length})</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {event.selectedImages.map(att => {
                      const decision = att.decision || 'approved';

                      return (
                        <div key={att.id} className="relative group">
                          <div 
                            className={`
                              relative w-full h-40 bg-gray-800 rounded-lg border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-all
                              ${decision === 'approved' ? 'border-green-500/50' : 'border-orange-500/50'}
                            `}
                            onClick={() => setSelectedImage(att.file_url)}
                          >
                            <img src={att.file_url} alt="" className="w-full h-full object-contain" />

                            <div className="absolute bottom-2 left-2 z-10">
                              {decision === 'approved' ? (
                                <Badge className="bg-green-500/90 hover:bg-green-500 text-white border-none shadow-sm">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                                </Badge>
                              ) : (
                                <Badge className="bg-orange-500/90 hover:bg-orange-500 text-white border-none shadow-sm">
                                  <AlertCircle className="w-3 h-3 mr-1" /> Changes
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {event.type === 'decision' && event.referenceAttachments?.length > 0 && (
                <div className="pl-10 space-y-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Uploaded Images</p>
                  {event.referenceAttachments.filter(a => a.attachment_type === 'image').length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {event.referenceAttachments.filter(a => a.attachment_type === 'image').map(att => (
                        <div key={att.id} className="relative group">
                          <div 
                            className="relative w-full h-40 bg-gray-800 rounded-lg border-2 border-gray-700 hover:border-gray-500 flex items-center justify-center overflow-hidden cursor-pointer transition-all"
                            onClick={() => setSelectedImage(att.file_url)}
                          >
                            <img src={att.file_url} alt="" className="w-full h-full object-contain" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {event.referenceAttachments.filter(a => a.attachment_type !== 'image').map(att => (
                      <a
                        key={att.id}
                        href={att.attachment_type === 'link' ? att.link_url : att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 transition-colors text-sm text-blue-400"
                      >
                        {att.attachment_type === 'link' ? <LinkIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        {att.label || (att.attachment_type === 'link' ? att.link_url : 'Attached File')}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {event.type !== 'decision' && event.attachments?.length > 0 && (
                <div className="pl-10 space-y-3">
                  {event.attachments.filter(a => a.attachment_type === 'image').length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {event.attachments.filter(a => a.attachment_type === 'image').map(att => {
                        const isSelected = selectedImageIds.includes(att.id);
                        const imageDecisions = decisions.filter(d => d.target_attachment_id === att.id);
                        const latestDecision = imageDecisions.sort((a,b) => new Date(b.created_date) - new Date(a.created_date))[0];

                        return (
                          <div key={att.id} className="relative group">
                            <div 
                              className={`
                                relative w-full h-40 bg-gray-800 rounded-lg border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-all
                                ${isSelected ? 'border-red-500 ring-2 ring-red-500/20' : 'border-gray-700 hover:border-gray-500'}
                              `}
                              onClick={() => setSelectedImage(att.file_url)}
                            >
                              <img src={att.file_url} alt="" className="w-full h-full object-contain" />

                              {canReview && requestType === 'image_review' && (
                                <div className="absolute top-2 right-2 z-10">
                                  <Checkbox 
                                    checked={isSelected}
                                    onCheckedChange={() => handleImageSelect(att.id)}
                                    className="bg-black/50 border-white data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 w-5 h-5"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              )}

                              {latestDecision && (
                                <div className="absolute bottom-2 left-2 z-10">
                                  {latestDecision.decision === 'approved' ? (
                                    <Badge className="bg-green-500/90 hover:bg-green-500 text-white border-none shadow-sm">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-orange-500/90 hover:bg-orange-500 text-white border-none shadow-sm">
                                      <AlertCircle className="w-3 h-3 mr-1" /> Changes
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {event.attachments.filter(a => a.attachment_type !== 'image').map(att => (
                      <a
                        key={att.id}
                        href={att.attachment_type === 'link' ? att.link_url : att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 transition-colors text-sm text-blue-400"
                      >
                        {att.attachment_type === 'link' ? <LinkIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        {att.label || (att.attachment_type === 'link' ? att.link_url : 'Attached File')}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedImageIds.length > 0 && requestType === 'image_review' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in">
          <Card className="bg-gray-900 border-gray-700 shadow-2xl ring-1 ring-white/10">
            <CardContent className="p-3 flex items-center gap-4">
              <span className="text-white font-medium pl-2">{selectedImageIds.length} selected</span>
              
              <div className="h-6 w-px bg-gray-700" />
              
              <div className="flex gap-2">
                <Button 
                  size="sm"
                  onClick={() => handleReviewAction('approved')}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Approve Selected
                </Button>
                <Button 
                  size="sm"
                  onClick={() => handleReviewAction('changes_requested')}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Request Changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedImageIds([])}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={isReviewing} onOpenChange={setIsReviewing}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approved' ? 'Approve Selected Images' : 'Request Changes'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">
                {reviewAction === 'changes_requested' ? 'What changes are needed? *' : 'Add a note (optional)'}
              </label>
              <Textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={reviewAction === 'changes_requested' ? 'Describe changes...' : 'Great work!'}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-2 block">Upload Reference Images (Optional)</label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md transition-colors text-sm text-gray-300">
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload Images
                  </div>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleReviewImageUpload} disabled={isUploading} />
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
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsReviewing(false)} className="text-gray-400" disabled={isSubmitting}>Cancel</Button>
            <Button 
              onClick={handleSubmitReview}
              disabled={isSubmitting}
              className={reviewAction === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}