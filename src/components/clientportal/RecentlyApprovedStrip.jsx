import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getRequestTypeInfo } from "./utils";
import { CopyRequestLinkButton } from "./ClientLinksCopyButtons";

/**
 * Compute approval metadata for a request.
 * Normalizes approvedAt, hoursSinceApproval, isFresh (< 1h).
 */
export function getApprovalMeta(request) {
  const approvedAt = request.approvedAt;
  if (!approvedAt) return { approvedAt: null, hoursSinceApproval: null, isFresh: false };
  const hoursSince = (Date.now() - new Date(approvedAt).getTime()) / (1000 * 60 * 60);
  return {
    approvedAt,
    hoursSinceApproval: Math.round(hoursSince * 10) / 10,
    isFresh: hoursSince < 1,
  };
}

// Single approved card — elevated, emerald-accented, distinct from workflow cards
function ApprovedCard({ request, getProjectClientSlug }) {
  const meta = getApprovalMeta(request);

  return (
    <Link
      to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=recently_approved`}
      className="block group"
    >
      <div
        className={`
          relative rounded-xl border-2 transition-all
          bg-gradient-to-br from-emerald-950/40 via-gray-900/60 to-gray-900/80
          border-emerald-500/50
          shadow-lg shadow-emerald-900/20
          hover:border-emerald-400/70 hover:shadow-emerald-800/30
          ${meta.isFresh ? 'animate-pulse-subtle ring-1 ring-emerald-400/30' : ''}
        `}
      >
        {/* Green left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-emerald-500" />

        <div className="pl-4 pr-3 py-3">
          {/* Top row: approval status + type */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approved by Client
              </span>
              {meta.isFresh && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                  Just now
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={e => e.preventDefault()}>
              <CopyRequestLinkButton
                slug={getProjectClientSlug(request.project_id)}
                requestId={request.id}
              />
              <ChevronRight className="w-4 h-4 text-emerald-600 group-hover:text-emerald-400 transition-colors" />
            </div>
          </div>

          {/* Title */}
          <h4 className="text-white font-medium text-sm mb-1.5 group-hover:text-emerald-300 transition-colors line-clamp-1">
            {request.title}
          </h4>

          {/* Meta row: type badge + timestamp */}
          <div className="flex items-center justify-between gap-2">
            <Badge className={`${getRequestTypeInfo(request.request_type).color} text-xs`}>
              {getRequestTypeInfo(request.request_type).label}
            </Badge>
            {meta.approvedAt && (
              <span className="text-emerald-400/80 text-xs">
                {formatDistanceToNow(new Date(meta.approvedAt), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * Recently Approved horizontal strip — sits at top of Active Review.
 * Hidden when count === 0.
 */
export default function RecentlyApprovedStrip({ requests, getProjectClientSlug }) {
  if (!requests || requests.length === 0) return null;

  // Sort newest first
  const sorted = [...requests].sort((a, b) => {
    const aT = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
    const bT = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
    return bT - aT;
  });

  const freshCount = sorted.filter(r => getApprovalMeta(r).isFresh).length;

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/30 via-emerald-950/15 to-transparent overflow-hidden">
      {/* Header strip */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <span className="text-emerald-300 font-semibold text-sm tracking-wide">
              RECENTLY APPROVED
            </span>
            <span className="text-emerald-500/70 text-xs ml-2">
              {sorted.length} approval{sorted.length !== 1 ? 's' : ''} in last 48h
              {freshCount > 0 && (
                <span className="text-emerald-400 ml-1">
                  · {freshCount} in last hour
                </span>
              )}
            </span>
          </div>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-bold">
          ✓ {sorted.length}
        </Badge>
      </div>

      {/* Cards — horizontal scroll on many, vertical stack on few */}
      <div className="p-3">
        <div className={`
          ${sorted.length > 2 ? 'flex gap-3 overflow-x-auto pb-1 scrollbar-hide' : 'space-y-2'}
        `}>
          {sorted.map(request => (
            <div
              key={request.id}
              className={sorted.length > 2 ? 'min-w-[320px] max-w-[380px] shrink-0' : ''}
            >
              <ApprovedCard
                request={request}
                getProjectClientSlug={getProjectClientSlug}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}