import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function DesignReviewGallery({ images, decisions, requestId, userId, onCreateTask }) {
  const queryClient = useQueryClient();
  const [selectedImages, setSelectedImages] = useState([]);
  const [viewingImage, setViewingImage] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionType, setDecisionType] = useState('approved');

  const createDecisionMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientFeedbackDecision.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions'] });
      setDecisionNote('');
      setShowDecisionForm(false);
      setSelectedImages([]);
      toast.success('Decision recorded');
    },
  });

  const getImageState = (imageId) => {
    const imageDecisions = decisions.filter(
      d => d.target_type === 'attachment_image' && d.target_attachment_id === imageId
    );
    if (imageDecisions.length === 0) return { label: 'Pending', color: 'bg-gray-500', icon: Clock };

    const latest = imageDecisions.sort((a, b) =>
      new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date)
    )[0];

    if (latest.decision === 'approved') {
      return { label: 'Approved', color: 'bg-green-500', icon: CheckCircle2 };
    }
    return { label: 'Changes Requested', color: 'bg-orange-500', icon: XCircle };
  };

  const handleApproveImages = () => {
    setDecisionType('approved');
    setShowDecisionForm(true);
  };

  const handleRequestChanges = () => {
    setDecisionType('changes_requested');
    setShowDecisionForm(true);
  };

  const handleSubmitDecision = async () => {
    if (selectedImages.length === 0) {
      toast.error('Please select at least one image');
      return;
    }

    if (decisionType === 'changes_requested' && !decisionNote.trim()) {
      toast.error('Please provide a note explaining the requested changes');
      return;
    }

    try {
      for (const imageId of selectedImages) {
        const decision = await createDecisionMutation.mutateAsync({
          request_id: requestId,
          decided_by_type: 'internal_user',
          decided_by_id: userId,
          decision: decisionType,
          note: decisionNote,
          target_type: 'attachment_image',
          target_attachment_id: imageId,
          decided_at: new Date().toISOString(),
        });

        if (decisionType === 'approved' && onCreateTask) {
          // Show create task button for approved images
        }
      }
    } catch (error) {
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
      <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Design Review</h3>
            {selectedImages.length > 0 && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleApproveImages}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Approve ({selectedImages.length})
                </Button>
                <Button
                  size="sm"
                  onClick={handleRequestChanges}
                  variant="outline"
                  className="border-orange-500 text-orange-400"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Request Changes
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map(image => {
              const state = getImageState(image.id);
              const StateIcon = state.icon;
              const isSelected = selectedImages.includes(image.id);

              return (
                <div
                  key={image.id}
                  className={cn(
                    "relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                    isSelected ? "border-red-500 ring-2 ring-red-500" : "border-gray-700 hover:border-gray-600"
                  )}
                  onClick={() => toggleImageSelection(image.id)}
                >
                  <img
                    src={image.file_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-40 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingImage(image);
                      }}
                      className="text-white"
                    >
                      View Full Size
                    </Button>
                  </div>
                  <div className="absolute top-2 right-2">
                    <Badge className={cn("text-xs", state.color)}>
                      <StateIcon className="w-3 h-3 mr-1" />
                      {state.label}
                    </Badge>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 left-2">
                      <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-white" />
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
                {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
              </p>

              {decisionType === 'changes_requested' && (
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">
                    Explain what changes are needed *
                  </label>
                  <Textarea
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Describe the changes needed..."
                    className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                  />
                </div>
              )}

              {decisionType === 'approved' && (
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">
                    Add a note (optional)
                  </label>
                  <Textarea
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Add any comments..."
                    className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDecisionForm(false)}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitDecision}
                  disabled={createDecisionMutation.isPending}
                  className={decisionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
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
            <img src={viewingImage.file_url} alt="" loading="lazy" decoding="async" className="w-full h-auto" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}