import React, { useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertCircle, FileText, Upload, X, Loader2, Image as ImageIcon, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { isStructuredReview } from "./reviewBehavior";
import { JournalProseStyles } from "@/components/journal/JournalContentRenderer";
import { normalizeFeedbackComment } from "./normalizeFeedbackComment";
import HtmlContent from "@/components/shared/HtmlContent";
import LinkPreviewGrid from "@/components/shared/LinkPreviewGrid";
import { extractLinks, convertStructuredLinks } from "@/utils/extractLinks";

// ── CommentContentBlock: unified rendering with proper priority chain ──
// Images are rendered separately via event.attachments — NOT inside this block.
function CommentContentBlock({ comment }) {
  if (!comment) return null;
  const c = normalizeFeedbackComment(comment);
  if (!c) return null;

  const hasHtml = !!c.content_html;
  const hasFallback = !!c.content_fallback?.trim();
  const hasBody = !!c.body?.trim();

  // Extract links from comment content + structured links — do NOT filter against attachments
  // so structured link descriptions are preserved (attachments don't store descriptions)
  const commentLinks = extractLinks(c.content_html, c.body || c.content_fallback, [], c.links);

  return (
    <>
      {/* Content: content_html → content_fallback → body */}
      {hasHtml ?
      <div className="mb-3 pl-0 md:pl-10">
          <HtmlContent
          html={c.content_html}
          className="text-sm md:text-base" />
        
        </div> :
      hasFallback ?
      <p className="text-gray-300 whitespace-pre-wrap mb-3 pl-0 md:pl-10 text-sm md:text-base">{c.content_fallback}</p> :
      hasBody ?
      <p className="text-gray-300 whitespace-pre-wrap mb-3 pl-0 md:pl-10 text-sm md:text-base">{c.body}</p> :
      null}

      {/* Attachments divider + sections */}
      {(c.files.length > 0 || commentLinks.length > 0) && (
        <div className="pl-0 md:pl-10 mb-3 border-t border-gray-700/50 mt-4 pt-4 space-y-3">
          {/* Inline files */}
          {c.files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {c.files.map((file, idx) => (
                <a
                  key={idx}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 transition-colors text-sm text-blue-400"
                >
                  <FileText className="w-4 h-4" />
                  {file.name}
                </a>
              ))}
            </div>
          )}

          {/* Unified link preview grid */}
          {commentLinks.length > 0 && (
            <LinkPreviewGrid links={commentLinks} showHeader />
          )}
        </div>
      )}
    </>);

}

// Memoized timeline event card to prevent unnecessary re-renders
const TimelineEventCard = React.memo(function TimelineEventCard({
  event,
  canReview,
  requestType,
  isClientView,
  selectedImageIds,
  onImageSelect,
  onImageClick,
  onDeleteComment,
  onDeleteDecision,
  decisions
}) {
  const isClientComment = event.type === 'comment' && event.comment?.author_type === 'client_contact';
  const isInternalComment = event.type === 'comment' && event.comment?.author_type === 'internal_user';
  const isApprovedDecision = event.type === 'decision' && event.decision.decision === 'approved';
  const isChangesRequestedDecision = event.type === 'decision' && event.decision.decision === 'changes_requested';
  const isRequestPost = event.type === 'request_post';

  let cardClassName = "bg-black/60 backdrop-blur-xl border";
  let cardStyle = {};

  if (isRequestPost) {
    cardClassName = "backdrop-blur-xl border border-green-500/50";
    cardStyle = { backgroundColor: 'oklch(39.3% 0.095 152.535)' };
  } else if (isApprovedDecision) {
    cardClassName = "bg-blue-900/30 backdrop-blur-xl border border-blue-500/50";
  } else if (isChangesRequestedDecision) {
    cardClassName = "bg-orange-900/30 backdrop-blur-xl border border-orange-500/50";
  } else if (isInternalComment) {
    cardClassName = "backdrop-blur-xl border border-green-500/50";
    cardStyle = { backgroundColor: 'oklch(39.3% 0.095 152.535)' };
  } else if (isClientComment) {
    cardClassName = "bg-yellow-900/20 backdrop-blur-xl border border-yellow-500/50";
  } else {
    cardClassName = "bg-black/60 backdrop-blur-xl border border-gray-700";
  }

  return (
    <Card className={cardClassName} style={cardStyle}>
      <CardContent className="p-3 md:p-4">
        {/* Header Badge */}
        <div className="mb-3">
          {isRequestPost &&
          <Badge className="bg-green-500/20 text-green-400 border-green-500/50 border font-semibold text-xs">
              FOR REVIEW
            </Badge>
          }
          {isInternalComment &&
          <Badge className="bg-green-500/20 text-green-400 border-green-500/50 border font-semibold text-xs">
              FOR REVIEW
            </Badge>
          }
          {isClientComment &&
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 border font-semibold text-xs">
              COMMENT
            </Badge>
          }
          {isApprovedDecision &&
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50 border font-semibold text-xs">
              APPROVED
            </Badge>
          }
          {isChangesRequestedDecision &&
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 border font-semibold text-xs">
              CHANGE REQUESTED
            </Badge>
          }
        </div>

        <div className="flex items-start justify-between gap-3 mb-3">
          {event.type === 'request_post' &&
          <div className="flex items-center gap-2 text-green-400">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/50">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {event.creator?.full_name || 'Team'} posted review request
                </p>
                <p className="text-xs text-gray-400">{format(event.timestamp, 'MMM d, h:mm a')}</p>
              </div>
            </div>
          }

          {event.type === 'comment' &&
          <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">
                    {(event.comment?.author_display_name || event.author?.name || event.author?.full_name || 'S')[0]}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-white text-sm">
                    {event.comment?.author_display_name || event.author?.name || event.author?.full_name || 'System'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {format(event.timestamp, 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
              {!isClientView && onDeleteComment &&
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                if (confirm('Delete this comment?')) {
                  onDeleteComment(event.comment.id);
                }
              }}
              className="text-gray-500 hover:text-red-500 h-8 w-8">
              
                  <Trash2 className="w-4 h-4" />
                </Button>
            }
            </div>
          }

          {event.type === 'decision' &&
          <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-white">
                {event.decision.decision === 'approved' ? <CheckCircle2 className="text-blue-500" /> : <AlertCircle className="text-orange-500" />}
                <div>
                  <p className="font-medium text-sm">
                    {event.decision?.decider_display_name || event.decider?.name || event.decider?.full_name || 'System'} {event.decision.decision === 'approved' ? 'Approved' : 'Requested Changes'}
                  </p>
                  <p className="text-xs text-gray-400">{format(event.timestamp, 'MMM d, h:mm a')}</p>
                </div>
              </div>
              {!isClientView && onDeleteDecision &&
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                if (confirm('Delete this decision and its associated attachments?')) {
                  onDeleteDecision(event.groupedDecisions.map((d) => d.id));
                }
              }}
              className="text-gray-500 hover:text-red-500 h-8 w-8">
              
                  <Trash2 className="w-4 h-4" />
                </Button>
            }
            </div>
          }
        </div>

        {/* Render comment content — priority: content_html → content_fallback → body */}
        <CommentContentBlock comment={event.comment} />
        {event.decision?.note &&
        <div className="mb-3 pl-0 md:pl-10 text-sm md:text-base">
            <HtmlContent
            html={event.decision.content_html || null}
            fallback={event.decision.note} />
          
          </div>
        }

        {event.type === 'decision' && event.selectedImages?.length > 0 &&
        <div className="pl-0 md:pl-10 mb-3 border-t border-gray-700/50 mt-4 pt-4">
            <div className="rounded-lg border border-gray-700/60 bg-gray-900/20 p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Reviewed Images ({event.selectedImages.length})</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {event.selectedImages.map((att, idx) => {
              const decision = att.decision || 'approved';
              const allImages = event.selectedImages.map((a) => a.file_url);

              return (
                <div key={att.id} className="relative group">
                    <div
                    className={`
                        relative w-full bg-gray-800 rounded-lg border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-all
                        ${decision === 'approved' ? 'border-green-500/50' : 'border-orange-500/50'}
                      `}
                    onClick={() => onImageClick(att.file_url, allImages, idx)}>
                    
                      <img src={att.file_url} alt="" loading="lazy" className="w-full h-auto max-h-[70vh] object-contain" />

                      <div className="absolute bottom-2 left-2 z-10">
                        {decision === 'approved' ?
                      <Badge className="bg-green-500/90 hover:bg-green-500 text-white border-none shadow-sm">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                          </Badge> :

                      <Badge className="bg-orange-500/90 hover:bg-orange-500 text-white border-none shadow-sm">
                            <AlertCircle className="w-3 h-3 mr-1" /> Changes
                          </Badge>
                      }
                      </div>
                    </div>
                  </div>);

            })}
            </div>
            </div>
          </div>
        }

        {event.type === 'decision' && event.referenceAttachments?.length > 0 &&
        <div className="pl-0 md:pl-10 space-y-3 border-t border-gray-700/50 mt-4 pt-4">
            {event.referenceAttachments.filter((a) => a.attachment_type === 'image').length > 0 &&
          <div className="rounded-lg border border-gray-700/60 bg-gray-900/20 p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Uploaded Images</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {event.referenceAttachments.filter((a) => a.attachment_type === 'image').map((att, idx) => {
              const allImages = event.referenceAttachments.filter((a) => a.attachment_type === 'image').map((a) => a.file_url);
              return (
                <div key={att.id} className="relative group">
                      <div
                    className="relative w-full bg-gray-800 rounded-lg border-2 border-gray-700 hover:border-gray-500 flex items-center justify-center overflow-hidden cursor-pointer transition-all"
                    onClick={() => onImageClick(att.file_url, allImages, idx)}>
                    
                        <img src={att.file_url} alt="" loading="lazy" className="w-full h-auto max-h-[70vh] object-contain" />
                      </div>
                    </div>);

            })}
              </div>
            </div>
          }

            {/* Link attachments as preview cards */}
            {(() => {
              const linkAtts = event.referenceAttachments.filter((a) => a.attachment_type === 'link');
              if (linkAtts.length === 0) return null;
              const previewLinks = convertStructuredLinks(linkAtts.map(a => ({ url: a.link_url, name: a.label })));
              return <LinkPreviewGrid links={previewLinks} />;
            })()}

            {/* File attachments as chips */}
            {event.referenceAttachments.filter((a) => a.attachment_type !== 'image' && a.attachment_type !== 'link').length > 0 && (
            <div className="flex flex-wrap gap-2">
              {event.referenceAttachments.filter((a) => a.attachment_type !== 'image' && a.attachment_type !== 'link').map((att) =>
            <a
              key={att.id}
              href={att.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 transition-colors text-sm text-blue-400">
              
                  <FileText className="w-4 h-4" />
                  {att.label || 'Attached File'}
                </a>
            )}
            </div>
            )}
          </div>
        }

        {/* Non-comment event attachments (request_post): full rendering with review checkboxes */}
        {event.type !== 'decision' && event.type !== 'comment' && event.attachments?.length > 0 &&
        <div className="pl-0 md:pl-10 space-y-3 border-t border-gray-700/50 mt-4 pt-4">
            {canReview && isStructuredReview(requestType) && event.attachments.filter((a) => a.attachment_type === 'image').length > 0 &&
          <p className="text-sm text-purple-400 font-medium">
                SELECT CHECKBOX on IMAGE(s) above to APPROVE or REQUEST CHANGES
              </p>
          }
            {event.attachments.filter((a) => a.attachment_type === 'image').length > 0 &&
          <div className="rounded-lg border border-gray-700/60 bg-gray-900/20 p-3 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Images</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {event.attachments.filter((a) => a.attachment_type === 'image').map((att, idx) => {
              const isSelected = selectedImageIds.includes(att.id);
              const imageDecisions = decisions.filter((d) => d.target_attachment_id === att.id);
              const latestDecision = imageDecisions.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
              const allImages = event.attachments.filter((a) => a.attachment_type === 'image').map((a) => a.file_url);

              return (
                <div key={att.id} className="relative group">
                      <div
                    className={`
                          relative w-full bg-gray-800 rounded-lg border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-all
                          ${isSelected ? 'border-red-500 ring-2 ring-red-500/20' : 'border-gray-700 hover:border-gray-500'}
                        `}
                    onClick={() => onImageClick(att.file_url, allImages, idx)}>
                    
                        <img src={att.file_url} alt="" loading="lazy" className="w-full h-auto max-h-[70vh] object-contain" />

                        {canReview && isStructuredReview(requestType) &&
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-black/70 rounded px-2 py-1">
                            <span className="text-white text-xs font-medium">SELECT</span>
                            <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onImageSelect(att.id)}
                        className="bg-black/50 border-white data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 w-5 h-5"
                        onClick={(e) => e.stopPropagation()} />
                      
                          </div>
                    }

                        {latestDecision &&
                    <div className="absolute bottom-2 left-2 z-10">
                            {latestDecision.decision === 'approved' ?
                      <Badge className="bg-green-500/90 hover:bg-green-500 text-white border-none shadow-sm">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                              </Badge> :

                      <Badge className="bg-orange-500/90 hover:bg-orange-500 text-white border-none shadow-sm">
                                <AlertCircle className="w-3 h-3 mr-1" /> Changes
                              </Badge>
                      }
                          </div>
                    }
                      </div>
                    </div>);

            })}
              </div>
            </div>
          }

            {(() => {
              const linkAtts = event.attachments.filter((a) => a.attachment_type === 'link');
              if (linkAtts.length === 0) return null;
              const previewLinks = convertStructuredLinks(linkAtts.map(a => ({ url: a.link_url, name: a.label })));
              return <LinkPreviewGrid links={previewLinks} />;
            })()}

            {event.attachments.filter((a) => a.attachment_type !== 'image' && a.attachment_type !== 'link').length > 0 && (
            <div className="flex flex-wrap gap-2">
              {event.attachments.filter((a) => a.attachment_type !== 'image' && a.attachment_type !== 'link').map((att) =>
            <a
              key={att.id}
              href={att.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 transition-colors text-sm text-blue-400">
              
                  <FileText className="w-4 h-4" />
                  {att.label || 'Attached File'}
                </a>
            )}
            </div>
            )}
          </div>
        }

        {/* Comment event attachments: images + files from attachment records */}
        {event.type === 'comment' && event.attachments?.length > 0 && (() => {
          const imageAtts = event.attachments.filter(a => a.attachment_type === 'image' && a.file_url);
          const fileAtts = event.attachments.filter(a => a.attachment_type === 'file');
          if (imageAtts.length === 0 && fileAtts.length === 0) return null;
          return (
            <div className="pl-0 md:pl-10 space-y-3 mt-3">
              {imageAtts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {imageAtts.map((att) => (
                    <div key={att.id} className="relative rounded-lg overflow-hidden border border-gray-700 bg-gray-800 cursor-pointer"
                      onClick={() => onImageClick(att.file_url, imageAtts.map(a => a.file_url), imageAtts.indexOf(att))}>
                      <img src={att.file_url} alt="" loading="lazy" className="w-full h-auto max-h-[50vh] object-contain" />
                    </div>
                  ))}
                </div>
              )}
              {fileAtts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fileAtts.map(att => (
                    <a
                      key={att.id}
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 transition-colors text-sm text-blue-400"
                    >
                      <FileText className="w-4 h-4" />
                      {att.label || 'Attached File'}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>);

});

export default function ClientFeedbackThread({ requestId, clientContactId, isClientView, userId, accessRole, requestType, token, slug, request, onDecisionSubmit, onDeleteComment, onDeleteDecision, onImageClick: onImageClickProp, onSelectionChange }) {
  const queryClient = useQueryClient();
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

    // Get all decision times for matching attachments by time proximity only
    const allDecisionTimes = decisions.map((d) => new Date(d.decided_at || d.created_date).getTime());

    // Find earliest decision time (with small buffer to handle same-millisecond cases)
    const earliestDecisionTime = allDecisionTimes.length > 0 ?
    Math.min(...allDecisionTimes) - 100 // 100ms buffer
    : Date.now() + 1000000;

    // Pre-identify which attachments belong to decisions by TIME PROXIMITY ONLY (not creator)
    // Because backend creates attachments with service role, creator IDs won't match
    const decisionAttachmentIds = new Set();
    attachments.forEach((a) => {
      if (a.comment_id) return;
      const attachmentTime = new Date(a.posted_at || a.created_date).getTime();

      // Check if this attachment was uploaded close to ANY decision (within 5 seconds)
      const isDecisionAttachment = allDecisionTimes.some((dt) => Math.abs(attachmentTime - dt) < 5000);
      if (isDecisionAttachment) {
        decisionAttachmentIds.add(a.id);
      }
    });

    // Initial request attachments: not linked to comments, not decision-related, uploaded BEFORE first decision
    const requestAttachments = attachments.filter((a) => {
      if (a.comment_id) return false;
      if (decisionAttachmentIds.has(a.id)) return false;
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
        creator: request?.creator
      });
    }

    const visibleComments = isClientView ?
    comments.filter((c) => c.visibility === 'client_visible') :
    comments;

    // Add standalone comments (not associated with decisions)
    // Filter out any comments that have a matching decision with the same timestamp and author
    visibleComments.forEach((comment) => {
      const commentTime = new Date(comment.posted_at || comment.created_date).getTime();
      const commentAuthorId = comment.author_id;
      const commentAuthorType = comment.author_type;

      // Check if there's a decision that matches this comment (same author, within 2 seconds)
      const hasMatchingDecision = decisions.some((decision) => {
        const decisionTime = new Date(decision.decided_at || decision.created_date).getTime();
        return decision.decided_by_id === commentAuthorId &&
        decision.decided_by_type === commentAuthorType &&
        Math.abs(decisionTime - commentTime) < 2000;
      });

      // Only add comment if it doesn't have a matching decision (avoid duplicates)
      if (!hasMatchingDecision) {
        // Uploaded images: linked via comment_id
        const uploadedAttachments = attachments.filter((a) => a.comment_id === comment.id);
        // Selected existing images: referenced by ID on the comment record
        const selectedIds = comment.selected_attachment_ids || [];
        const selectedAttachments = selectedIds.length > 0
          ? attachments.filter((a) => selectedIds.includes(a.id))
          : [];
        // Merge, deduplicating by id
        const seenIds = new Set(uploadedAttachments.map(a => a.id));
        const mergedAttachments = [...uploadedAttachments];
        selectedAttachments.forEach(a => {
          if (!seenIds.has(a.id)) {
            mergedAttachments.push(a);
            seenIds.add(a.id);
          }
        });

        events.push({
          type: 'comment',
          timestamp: new Date(comment.posted_at || comment.created_date),
          comment,
          author: comment.author,
          attachments: mergedAttachments
        });
      }
    });

    // Group decisions by timestamp and decider to handle batch reviews
    // Use 10-second window to group decisions made together
    const decisionGroups = {};

    // Sort decisions by time first
    const sortedDecisions = [...decisions].sort((a, b) =>
    new Date(a.decided_at || a.created_date) - new Date(b.decided_at || b.created_date)
    );

    sortedDecisions.forEach((decision) => {
      const timestampStr = decision.decided_at || decision.created_date;
      const timestamp = new Date(timestampStr).getTime();
      const deciderKey = `${decision.decided_by_type}_${decision.decided_by_id}`;

      // Find existing group within 10 seconds by same decider
      let foundGroup = null;
      for (const [key, group] of Object.entries(decisionGroups)) {
        if (!key.startsWith(deciderKey)) continue;
        const groupTime = new Date(group[0].decided_at || group[0].created_date).getTime();
        if (Math.abs(timestamp - groupTime) < 10000) {
          foundGroup = key;
          break;
        }
      }

      if (foundGroup) {
        decisionGroups[foundGroup].push(decision);
      } else {
        const key = `${deciderKey}_${timestamp}`;
        decisionGroups[key] = [decision];
      }
    });

    Object.values(decisionGroups).forEach((group) => {
      const firstDecision = group[0];
      const decider = firstDecision.decider;
      const decisionTime = new Date(firstDecision.decided_at || firstDecision.created_date).getTime();

      // Get reference attachments uploaded WITH this decision (by TIME PROXIMITY only)
      // Creator matching doesn't work because backend uses service role
      const referenceAttachments = attachments.filter((a) => {
        if (a.comment_id) return false;

        const attachmentTime = new Date(a.posted_at || a.created_date).getTime();
        const timeDiff = Math.abs(attachmentTime - decisionTime);

        // Match by time proximity only (within 5 seconds of this decision)
        return timeDiff < 5000;
      });

      // Get the selected/reviewed images
      const selectedImageDecisions = group.filter((d) => d.target_type === 'attachment_image');

      const selectedImages = selectedImageDecisions.map((d) => {
        if (d.target_image_url) {
          return {
            id: d.target_attachment_id || d.id,
            file_url: d.target_image_url,
            attachment_type: 'image',
            decision: d.decision
          };
        } else if (d.target_attachment_id) {
          const attachment = attachments.find((a) => a.id === d.target_attachment_id);
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
        groupedDecisions: group
      });
    });

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [comments, decisions, attachments, isClientView, request]);

  const handleImageSelect = useCallback((imageId) => {
    setSelectedImageIds((prev) => {
      const next = prev.includes(imageId)
        ? prev.filter((id) => id !== imageId)
        : [...prev, imageId];
      onSelectionChange?.(next);
      return next;
    });
  }, [onSelectionChange]);

  const handleImageClick = useCallback((url, allImages, idx) => {
    if (onImageClickProp) {
      onImageClickProp(url, allImages, idx);
    }
  }, [onImageClickProp]);

  const handleReviewAction = (action) => {
    setReviewAction(action);
    setIsReviewing(true);
  };

  const handleReviewImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadPromises = files.map((file) => base44.integrations.Core.UploadFile({ file }));
      const results = await Promise.all(uploadPromises);
      const urls = results.map((r) => r.file_url);
      setReviewNewImages((prev) => [...prev, ...urls]);
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
      onSelectionChange?.([]);
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

  const canReview = accessRole === 'approver' && isClientView || !isClientView && userId;

  return (
    <>
      <JournalProseStyles />
      <div className="space-y-6 pb-20">
        {timeline.map((event, idx) =>
        <TimelineEventCard
          key={`${event.type}-${event.timestamp.getTime()}-${idx}`}
          event={event}
          canReview={canReview}
          requestType={requestType}
          isClientView={isClientView}
          selectedImageIds={selectedImageIds}
          onImageSelect={handleImageSelect}
          onImageClick={handleImageClick}
          onDeleteComment={onDeleteComment}
          onDeleteDecision={onDeleteDecision}
          decisions={decisions} />

        )}
      </div>

      {selectedImageIds.length > 0 && isStructuredReview(requestType) &&
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in w-[95%] md:w-auto">
          <Card className="bg-gray-900 border-gray-700 shadow-2xl ring-1 ring-white/10">
            <CardContent className="p-2 md:p-3 flex flex-col md:flex-row items-center gap-2 md:gap-4">
              <span className="text-white font-medium text-sm">{selectedImageIds.length} selected</span>
              
              <div className="hidden md:block h-6 w-px bg-gray-700" />
              
              <div className="flex gap-2 w-full md:w-auto">
                <Button
                size="sm"
                onClick={() => handleReviewAction('approved')}
                className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-none text-xs md:text-sm">
                
                  <CheckCircle2 className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Approve Selected</span>
                  <span className="md:hidden">Approve</span>
                </Button>
                <Button
                size="sm"
                onClick={() => handleReviewAction('changes_requested')}
                className="bg-orange-600 hover:bg-orange-700 text-white flex-1 md:flex-none text-xs md:text-sm">
                
                  <AlertCircle className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Request Changes</span>
                  <span className="md:hidden">Changes</span>
                </Button>
                <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSelectedImageIds([]); onSelectionChange?.([]); }}
                className="text-gray-400 hover:text-white">
                
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }

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
                className="bg-gray-800 border-gray-700 text-white" />
              
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
              
              {reviewNewImages.length > 0 &&
              <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                  {reviewNewImages.map((url, idx) =>
                <div key={idx} className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden border border-gray-700">
                      <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                      <button
                    onClick={() => setReviewNewImages((prev) => prev.filter((u) => u !== url))}
                    className="absolute top-0 right-0 bg-red-600 text-white p-0.5">
                    
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                )}
                </div>
              }
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsReviewing(false)} className="text-gray-400" disabled={isSubmitting}>Cancel</Button>
            <Button
              onClick={handleSubmitReview}
              disabled={isSubmitting}
              className={reviewAction === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}>
              
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>);

}