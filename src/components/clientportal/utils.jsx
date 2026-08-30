import { CheckCircle2, AlertCircle, Clock, Archive, FileText } from "lucide-react";
import { isStructuredReview } from "./reviewBehavior";
import { getRequestStateCanonical } from "./stateHelpers";

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
  },
  client_scope_review: {
    label: "Scope Review",
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 border"
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
  budget_review: "image_review",      // Structured review - same as design_review
  deliverable_review: "image_review",  // Structured review - same as design_review
  client_scope_review: "scope_review"  // Item-level approval workflow
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
  "todo_list",
  "client_scope_review"
];

export const getRequestTypeInfo = (type) => {
  const config = REQUEST_TYPE_UI[type];
  if (config) {
    return { label: config.label, color: config.color };
  }
  return { label: type.replace('_', ' '), color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border' };
};

export const getRequestState = (request, allDecisions = [], allAttachments = []) => {
  const canonical = getRequestStateCanonical(request, allDecisions, allAttachments);

  // Map canonical key → UI badge
  const UI_MAP = {
    draft:              { label: 'Draft',              color: 'bg-gray-500/20 text-gray-400 border-gray-500/50 border',                                                                               icon: FileText },
    archived:           { label: 'Archived',           color: 'bg-[oklch(74.6%_0.16_232.661)]/10 text-[oklch(74.6%_0.16_232.661)] border-[oklch(74.6%_0.16_232.661)]/20 border',                     icon: Archive },
    approved:           { label: canonical.label,      color: 'bg-[oklch(64.8%_0.2_131.684)]/20 text-[oklch(64.8%_0.2_131.684)] border-[oklch(64.8%_0.2_131.684)]/50 border',                       icon: CheckCircle2 },
    changes_requested:  { label: 'Changes Requested',  color: 'bg-[oklch(85.2%_0.199_91.936)]/20 text-[oklch(85.2%_0.199_91.936)] border-[oklch(85.2%_0.199_91.936)]/50 border',                    icon: AlertCircle },
    awaiting_review:    { label: 'Needs Review',       color: 'bg-[oklch(57.7%_0.245_27.325)]/20 text-[oklch(57.7%_0.245_27.325)] border-[oklch(57.7%_0.245_27.325)]/50 border',                    icon: Clock },
  };

  return UI_MAP[canonical.key] || UI_MAP.awaiting_review;
};