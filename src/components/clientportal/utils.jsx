import { CheckCircle2, AlertCircle, Clock, Archive, FileText } from "lucide-react";

/**
 * UI label and color configuration for request types
 */
export const REQUEST_TYPE_UI = {
  question: {
    label: "Question",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/50 border"
  },
  feedback_needed: {
    label: "Review Required",
    color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 border"
  },
  design_review: {
    label: "Design Review",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/50 border"
  },
  client_need: {
    label: "Need From Client",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/50 border"
  },
  todo_list: {
    label: "Task List",
    color: "bg-teal-500/20 text-teal-400 border-teal-500/50 border"
  },
  // New types (behavior same as feedback_needed)
  update: {
    label: "Project Update",
    color: "bg-gray-500/20 text-gray-400 border-gray-500/50 border"
  },
  budget_review: {
    label: "Budget Review",
    color: "bg-rose-500/20 text-rose-400 border-rose-500/50 border"
  },
  deliverable_review: {
    label: "Deliverable Review",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 border"
  }
};

/**
 * Behavior alias mapping - maps types to their behavior group
 * decision: standard approve/changes_requested flow
 * image_review: per-image decision flow
 * checklist: todo-based completion flow
 */
export const REQUEST_TYPE_BEHAVIOR = {
  question: "decision",
  feedback_needed: "decision",
  client_need: "decision",
  design_review: "image_review",
  todo_list: "checklist",
  // New types mapped to existing behavior
  update: "decision",
  budget_review: "decision",
  deliverable_review: "decision"
};

/**
 * Types available for creating new requests (excludes legacy 'feedback_needed')
 */
export const CREATE_TYPE_OPTIONS = [
  "update",
  "question",
  "client_need",
  "design_review",
  "budget_review",
  "deliverable_review",
  "todo_list"
];

export const getRequestTypeInfo = (type) => {
  const config = REQUEST_TYPE_UI[type];
  if (config) {
    return { label: config.label, color: config.color };
  }
  return { label: type.replace('_', ' '), color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border' };
};

export const getRequestState = (request, allDecisions, allAttachments) => {
  if (request.status === 'draft') return { label: 'Draft', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border', icon: FileText };
  if (request.status === 'archived') return { label: 'Archived', color: 'bg-[oklch(74.6%_0.16_232.661)]/10 text-[oklch(74.6%_0.16_232.661)] border-[oklch(74.6%_0.16_232.661)]/20 border', icon: Archive };
  
  // Explicit status check for approved
  if (request.status === 'approved') {
    const label = request.request_type === 'design_review' ? 'Approved' : 'Confirmed';
    return { label, color: 'bg-[oklch(64.8%_0.2_131.684)]/20 text-[oklch(64.8%_0.2_131.684)] border-[oklch(64.8%_0.2_131.684)]/50 border', icon: CheckCircle2 };
  }
  
  // Explicit status check for changes_requested to ensure it appears in bucket even if decisions are tricky
  if (request.status === 'changes_requested') {
    return { label: 'Changes Requested', color: 'bg-[oklch(85.2%_0.199_91.936)]/20 text-[oklch(85.2%_0.199_91.936)] border-[oklch(85.2%_0.199_91.936)]/50 border', icon: AlertCircle };
  }

  // Filter decisions that happened AFTER the last posted_at date
  const requestPostedAt = request.posted_at ? new Date(request.posted_at) : new Date(0);
  
  const relevantDecisions = allDecisions.filter(d => {
    const decisionDate = new Date(d.decided_at || d.created_date);
    return decisionDate > requestPostedAt && d.request_id === request.id;
  });

  // 1. Check Global/Request-level Decision first
  const latestGlobalDecision = relevantDecisions
    .filter(d => d.target_type === 'request')
    .sort((a, b) => new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date))[0];

  if (latestGlobalDecision?.decision === 'changes_requested') {
    return { label: 'Changes Requested', color: 'bg-[oklch(85.2%_0.199_91.936)]/20 text-[oklch(85.2%_0.199_91.936)] border-[oklch(85.2%_0.199_91.936)]/50 border', icon: AlertCircle };
  }
  if (latestGlobalDecision?.decision === 'approved') {
    // Determine label based on request type
    const label = request.request_type === 'design_review' ? 'Approved' : 'Confirmed';
    return { label, color: 'bg-[oklch(64.8%_0.2_131.684)]/20 text-[oklch(64.8%_0.2_131.684)] border-[oklch(64.8%_0.2_131.684)]/50 border', icon: CheckCircle2 };
  }

  // 2. Check Image-level Decisions (if no global decision)
  const attachments = allAttachments.filter(a => a.request_id === request.id);
  // Only count images uploaded by internal users (exclude client reference uploads) and NOT attached to comments
  const images = attachments.filter(a => a.attachment_type === 'image' && a.created_by_type !== 'client_contact' && !a.comment_id);
  
  if (images.length > 0) {
    const imageDecisions = relevantDecisions.filter(d => d.target_type === 'attachment_image');
    
    // If ANY image has changes requested -> Changes Requested
    if (imageDecisions.some(d => d.decision === 'changes_requested')) {
      return { label: 'Changes Requested', color: 'bg-[oklch(85.2%_0.199_91.936)]/20 text-[oklch(85.2%_0.199_91.936)] border-[oklch(85.2%_0.199_91.936)]/50 border', icon: AlertCircle };
    }

    // If ALL images are approved -> Approved (always "Approved" for image reviews)
    const allApproved = images.every(img => 
      imageDecisions.some(d => d.target_attachment_id === img.id && d.decision === 'approved')
    );

    if (allApproved) {
      return { label: 'Approved', color: 'bg-[oklch(64.8%_0.2_131.684)]/20 text-[oklch(64.8%_0.2_131.684)] border-[oklch(64.8%_0.2_131.684)]/50 border', icon: CheckCircle2 };
    }
  }

  // 3. Default: Needs Review (includes Overdue)
  if (request.due_date && new Date(request.due_date) < new Date()) {
    return { label: 'Needs Review', color: 'bg-[oklch(57.7%_0.245_27.325)]/20 text-[oklch(57.7%_0.245_27.325)] border-[oklch(57.7%_0.245_27.325)]/50 border', icon: Clock };
  }

  return { label: 'Needs Review', color: 'bg-[oklch(57.7%_0.245_27.325)]/20 text-[oklch(57.7%_0.245_27.325)] border-[oklch(57.7%_0.245_27.325)]/50 border', icon: Clock };
};