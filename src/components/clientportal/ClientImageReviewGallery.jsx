import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, Loader2, Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const getImageState = (imageId, decisions) => {
  const imageDecisions = decisions.filter(
    d => d.target_type === 'attachment_image' && d.target_attachment_id === imageId
  );
  if (imageDecisions.length === 0) return { label: 'Pending', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border', icon: Clock };

  const latest = imageDecisions.sort((a, b) =>
    new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date)
  )[0];

  if (latest.decision === 'approved') {
    return { label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/50 border', icon: CheckCircle2 };
  }
  return { label: 'Changes Requested', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50 border', icon: XCircle };
};

export default function ClientImageReviewGallery({ requestId, userId, clientContactId, requestType, accessRole }) {
  const queryClient = useQueryClient();
  const [selectedImages, setSelectedImages] = useState([]);
  const [viewingImage, setViewingImage] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionType, setDecisionType] = useState('approved');
  const [uploadedDecisionImages, setUploadedDecisionImages] = useState([]);
  const [uploadingDecisionImages, setUploadingDecisionImages] = useState(false);

  const { data: attachments = [] } = useQuery({
    queryKey: ['clientFeedbackAttachments', requestId],
    queryFn: () => base44.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['clientFeedbackDecisions', requestId],
    queryFn: () => base44.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
  });

  const createDecisionMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackDecision.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments'] });
      setDecisionNote('');
      setShowDecisionForm(false);
      setSelectedImages([]);
      setUploadedDecisionImages([]);
      toast.success('Decision recorded');
    },
  });

  const createAttachmentMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackAttachment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments'] });
    },
  });

  const images = attachments.filter(a => a.attachment_type === 'image');

  if (requestType !== 'image_review' || images.length === 0) return null;

  const isClientView = !!clientContactId;
  const canMakeDecision = isClientView ? accessRole === 'approver' : !!userId;

  const handleApproveImages = () => {
    setDecisionType('approved');
    setShowDecisionForm(true);
  };

  const handleRequestChanges = () => {
    setDecisionType('changes_requested');
    setShowDecisionForm(true);
  };

  const handleDecisionImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingDecisionImages(true);
    try {
      const uploadPromises = files.map(file =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map(r => r.file_url);
      
      setUploadedDecisionImages([...uploadedDecisionImages, ...photoUrls]);
      toast.success('Images uploaded');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload images');
    } finally {
      setUploadingDecisionImages(false);
    }
  };

  const handleRemoveDecisionImage = (urlToRemove) => {
    setUploadedDecisionImages(uploadedDecisionImages.filter(url => url !== urlToRemove));
  };

  const handleSubmitDecision = async () => {
    if (selectedImages.length === 0 && uploadedDecisionImages.length === 0) {
      toast.error('Please select or upload at least one image');
      return;
    }

    if (decisionType === 'changes_requested' && !decisionNote.trim()) {
      toast.error('Please provide a note explaining the requested changes');
      return;
    }

    if (!isClientView && !userId) {
      toast.error('User not authenticated');
      return;
    }

    if (isClientView && !clientContactId) {
      toast.error('Client contact not verified');
      return;
    }

    try {
      // Create a comment summarizing this decision and attach any newly uploaded images
      const totalCount = selectedImages.length + uploadedDecisionImages.length;
      const commentBody = `${decisionType === 'approved' ? 'Approved' : 'Requested changes'} for ${totalCount} image${totalCount === 1 ? '' : 's'}.${decisionNote ? '\n\n' + decisionNote : ''}`;
      const comment = await base44.entities.ClientFeedbackComment.create({
        request_id: requestId,
        author_type: isClientView ? 'client_contact' : 'internal_user',
        author_id: isClientView ? clientContactId : userId,
        body: commentBody,
        visibility: 'client_visible',
        target_type: 'request',
      });

      const newAttachmentIds = [];
      for (const imageUrl of uploadedDecisionImages) {
        const attachment = await base44.entities.ClientFeedbackAttachment.create({
          request_id: requestId,
          comment_id: comment.id,
          attachment_type: 'image',
          file_url: imageUrl,
          created_by_type: isClientView ? 'client_contact' : 'internal_user',
          created_by_id: isClientView ? clientContactId : userId,
        });
        newAttachmentIds.push(attachment.id);
      }

      // Create decisions for selected existing images
      const allDecisions = [];
      for (const imageId of selectedImages) {
        allDecisions.push(
          base44.entities.ClientFeedbackDecision.create({
            request_id: requestId,
            decided_by_type: isClientView ? 'client_contact' : 'internal_user',
            decided_by_id: isClientView ? clientContactId : userId,
            decision: decisionType,
            note: decisionNote,
            target_type: 'attachment_image',
            target_attachment_id: imageId,
            decided_at: new Date().toISOString(),
          })
        );
      }

      // Create decisions for newly uploaded images
      for (const attachmentId of newAttachmentIds) {
        allDecisions.push(
          base44.entities.ClientFeedbackDecision.create({
            request_id: requestId,
            decided_by_type: isClientView ? 'client_contact' : 'internal_user',
            decided_by_id: isClientView ? clientContactId : userId,
            decision: decisionType,
            note: decisionNote,
            target_type: 'attachment_image',
            target_attachment_id: attachmentId,
            decided_at: new Date().toISOString(),
          })
        );
      }

      await Promise.all(allDecisions);
      
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions'] });
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackAttachments'] });
      setDecisionNote('');
      setShowDecisionForm(false);
      setSelectedImages([]);
      setUploadedDecisionImages([]);
      toast.success(`${decisionType === 'approved' ? 'Approval' : 'Change request'} submitted for ${selectedImages.length + uploadedDecisionImages.length} image(s)`);
    } catch (error) {
      console.error('Decision error:', error);
      toast.error('Failed to record decision');
    }
  };

  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev =>
      prev.includes(imageId) ? prev.filter(id => id !== imageId) : [...prev, imageId]
    );
  };

  return (
    <>
      <Card className="bg-black/60 backdrop-blur-xl border border-gray-700">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 mb-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Images for Review</h3>
              {canMakeDecision && (
                <p className="text-xs text-gray-400">
                  {selectedImages.length > 0 ? `${selectedImages.length} selected` : 'Tap images to select'}
                </p>
              )}
            </div>
            {canMakeDecision && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={handleApproveImages}
                  disabled={selectedImages.length === 0}
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Approve ({selectedImages.length})
                </Button>
                <Button
                  size="sm"
                  onClick={handleRequestChanges}
                  disabled={selectedImages.length === 0}
                  className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Request Changes
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {images.map(image => {
              const state = getImageState(image.id, decisions);
              const StateIcon = state.icon;
              const isSelected = selectedImages.includes(image.id);

              return (
                <div
                  key={image.id}
                  className={cn(
                    "relative group rounded-lg overflow-hidden border-2 transition-all",
                    canMakeDecision && "cursor-pointer hover:border-red-400",
                    isSelected ? "border-red-500 ring-2 ring-red-500" : "border-gray-700"
                  )}
                  onClick={() => canMakeDecision ? toggleImageSelection(image.id) : setViewingImage(image)}
                >
                  <img
                    src={image.file_url}
                    alt=""
                    className="w-full h-48 object-cover"
                  />
                  {canMakeDecision && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingImage(image);
                        }}
                        className="text-white bg-gray-800/80 hover:bg-gray-700/80"
                      >
                        View Full Size
                      </Button>
                    </div>
                  )}
                  {!canMakeDecision && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-black/50 text-white px-2 py-1 rounded text-xs">
                        Click to enlarge
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge className={cn("text-xs text-white shadow-lg", state.color)}>
                      <StateIcon className="w-3 h-3 mr-1" />
                      {state.label}
                    </Badge>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 left-2">
                      <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center shadow-lg border-2 border-white">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  )}
                  {canMakeDecision && !isSelected && (
                    <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-7 h-7 rounded-full bg-gray-700/80 flex items-center justify-center shadow-lg border-2 border-gray-500">
                        <div className="w-4 h-4 rounded-full border-2 border-white" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {showDecisionForm && (
        <Dialog open={showDecisionForm} onOpenChange={setShowDecisionForm}>
          <DialogContent className="bg-gray-900 text-white">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                {decisionType === 'approved' ? 'Approve Images' : 'Request Changes'}
              </h3>
              <p className="text-sm text-gray-400">
                {selectedImages.length} existing image{selectedImages.length > 1 ? 's' : ''} selected
                {uploadedDecisionImages.length > 0 && `, ${uploadedDecisionImages.length} new image${uploadedDecisionImages.length > 1 ? 's' : ''} uploaded`}
              </p>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  {decisionType === 'changes_requested' ? 'Explain what changes are needed *' : 'Add a note (optional)'}
                </label>
                <Textarea
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder={decisionType === 'changes_requested' ? 'Describe the changes needed...' : 'Add any comments...'}
                  className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                />
              </div>

              {uploadedDecisionImages.length > 0 && (
                <div>
                  <Label className="text-xs text-gray-400 mb-2 block">Uploaded Images ({uploadedDecisionImages.length})</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {uploadedDecisionImages.map((url, idx) => (
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
                          onClick={() => handleRemoveDecisionImage(url)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <input
                  id="decision-image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleDecisionImageUpload}
                  className="hidden"
                />
                <label htmlFor="decision-image-upload">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingDecisionImages}
                    className="border-gray-700 cursor-pointer w-full"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById('decision-image-upload').click();
                    }}
                  >
                    {uploadingDecisionImages ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Additional Images
                      </>
                    )}
                  </Button>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDecisionForm(false)}
                  className="border-gray-600 text-gray-200 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitDecision}
                  disabled={createDecisionMutation.isPending}
                  className={cn(
                    "text-white",
                    decisionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'
                  )}
                >
                  {createDecisionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    `Submit ${decisionType === 'approved' ? 'Approval' : 'Changes'}`
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {viewingImage && (
        <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
          <DialogContent className="max-w-4xl bg-gray-900">
            <img src={viewingImage.file_url} alt="" className="w-full h-auto" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}