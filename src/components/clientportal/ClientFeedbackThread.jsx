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

export default function ClientFeedbackThread({ requestId, clientContactId, isClientView, userId, accessRole, requestType, token, slug, request }) {
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

    const requestAttachments = attachments.filter(a => !a.comment_id);
    if (requestAttachments.length > 0 || request?.posted_at) {
      events.push({
        type: 'request_post',
        timestamp: new Date(request?.posted_at || request?.created_date || new Date()),
        message: 'Review Started',
        attachments: requestAttachments,
      });
    }

    const visibleComments = isClientView
      ? comments.filter(c => c.visibility === 'client_visible')
      : comments;

    visibleComments.forEach(comment => {
      const commentAttachments = attachments.filter(a => a.comment_id === comment.id);

      events.push({
        type: 'comment',
        timestamp: new Date(comment.created_date),
        comment,
        author: comment.author,
        attachments: commentAttachments,
      });
    });

    // Group decisions by timestamp and decider to handle batch reviews
    // Use rounded timestamp (to nearest second) to group decisions made together
    const decisionGroups = {};

    decisions.forEach(decision => {
      const timestamp = new Date(decision.decided_at || decision.created_date);
      const roundedTime = Math.floor(timestamp.getTime() / 1000); // Round to nearest second
      const key = `${decision.decided_by_type}_${decision.decided_by_id}_${roundedTime}`;
      if (!decisionGroups[key]) {
        decisionGroups[key] = [];
      }
      decisionGroups[key].push(decision);
    });

    Object.values(decisionGroups).forEach(group => {
      const firstDecision = group[0];
      const decider = firstDecision.decider;

      // Find associated comment created at roughly the same time by same person
      const associatedComment = visibleComments.find(c => 
        c.author_type === firstDecision.decided_by_type &&
        c.author_id === firstDecision.decided_by_id &&
        Math.abs(new Date(c.created_date) - new Date(firstDecision.decided_at || firstDecision.created_date)) < 5000
      );

      // Get reference images from the associated comment
      const referenceAttachments = associatedComment 
        ? attachments.filter(a => a.comment_id === associatedComment.id)
        : [];

      // Get the selected/reviewed images
      const selectedImageDecisions = group.filter(d => d.target_type === 'attachment_image');

      // Create display objects - use stored URL if available, otherwise look up attachment
      const selectedImages = selectedImageDecisions.map(d => {
        if (d.target_image_url) {
          // New decisions with stored URL
          return {
            id: d.target_attachment_id || d.id,
            file_url: d.target_image_url,
            attachment_type: 'image',
            decision: d.decision
          };
        } else if (d.target_attachment_id) {
          // Old decisions - look up attachment
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

      events.push({
        type: 'decision',
        timestamp: new Date(firstDecision.decided_at || firstDecision.created_date),
        decision: firstDecision,
        decider,
        referenceAttachments,
        selectedImages,
        groupedDecisions: group,
      });
    });

    return events.sort((a, b) => b.timestamp - a.timestamp);
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
        newImages: reviewNewImages
      };
      
      if (token) payload.token = token;
      if (slug) payload.slug = slug;
      
      const response = await base44.functions.invoke('publicClientDecision', payload);

      if (response.data?.success) {
        toast.success('Review submitted');
        
        setSelectedImageIds([]);
        setReviewNewImages([]);
        setReviewNote("");
        setIsReviewing(false);
        setReviewAction(null);

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
                      <p className="font-medium text-sm">Original Request</p>
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
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Reference Images</p>
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