import { CheckCircle2, AlertCircle, Clock, Archive, FileText } from "lucide-react";

export const getRequestTypeInfo = (type) => {
  const map = {
    question: { label: 'Question', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border' },
    update: { label: 'Update', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50 border' },
    image_review: { label: 'Design Review', color: 'bg-purple-500/20 text-purple-400 border-purple-500/50 border' },
    approval: { label: 'Need from Client', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50 border' },
  };
  return map[type] || { label: type.replace('_', ' '), color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border' };
};

export const getRequestState = (request, allDecisions, allAttachments) => {
  if (request.status === 'draft') return { label: 'Draft', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border', icon: FileText };
  if (request.status === 'archived') return { label: 'Archived', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20 border', icon: Archive };

  // Filter decisions that happened AFTER the last posted_at date
  // If posted_at is null (shouldn't happen for posted/archived), default to epoch
  const requestPostedAt = request.posted_at ? new Date(request.posted_at) : new Date(0);
  
  // We only care about decisions made AFTER the request was last posted/resent
  const relevantDecisions = allDecisions.filter(d => {
    const decisionDate = new Date(d.decided_at || d.created_date);
    return decisionDate > requestPostedAt && d.request_id === request.id;
  });

  const attachments = allAttachments.filter(a => a.request_id === request.id);

  // For image_review requests
  if (request.request_type === 'image_review') {
    // Only count images uploaded by internal users (exclude client reference uploads)
    const images = attachments.filter(a => a.attachment_type === 'image' && a.created_by_type !== 'client_contact');
    const imageDecisions = relevantDecisions.filter(d => d.target_type === 'attachment_image');

    // If ANY image has changes requested, the whole request needs attention
    if (imageDecisions.some(d => d.decision === 'changes_requested')) {
      return { label: 'Changes Requested', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50 border', icon: AlertCircle };
    }

    // If ALL images have been approved
    if (images.length > 0 && images.every(img =>
      imageDecisions.some(d => d.target_attachment_id === img.id && d.decision === 'approved')
    )) {
      return { label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/50 border', icon: CheckCircle2 };
    }

    // Check for overdue (only if not fully decided)
    // Logic: If there are images pending decision (not approved/rejected in relevant decisions)
    const pendingImages = images.filter(img => !imageDecisions.some(d => d.target_attachment_id === img.id));
    if (pendingImages.length > 0) {
        if (request.due_date && new Date(request.due_date) < new Date()) {
            return { label: 'Overdue', color: 'bg-red-500/20 text-red-400 border-red-500/50 border', icon: Clock };
        }
        return { label: 'Needs Review', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border', icon: Clock };
    }
    
    // Fallback if no images but type is image_review (shouldn't happen often)
    return { label: 'Needs Review', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border', icon: Clock };
  }

  // For non-image_review requests
  // Get the LATEST relevant decision
  const latestDecision = relevantDecisions
    .filter(d => d.target_type === 'request')
    .sort((a, b) => new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date))[0];

  if (latestDecision?.decision === 'approved') {
    return { label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/50 border', icon: CheckCircle2 };
  }

  if (latestDecision?.decision === 'changes_requested') {
    return { label: 'Changes Requested', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50 border', icon: AlertCircle };
  }

  if (request.due_date && new Date(request.due_date) < new Date()) {
    return { label: 'Overdue', color: 'bg-red-500/20 text-red-400 border-red-500/50 border', icon: Clock };
  }

  return { label: 'Needs Review', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50 border', icon: Clock };
};