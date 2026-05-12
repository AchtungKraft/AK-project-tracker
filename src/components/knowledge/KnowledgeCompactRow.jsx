import React from "react";
import { cn } from "@/lib/utils";
import { Crown, Pin, AlertTriangle, Camera, ListOrdered, Clock } from "lucide-react";
import { format } from "date-fns";

const POST_DOT = {
  procedure:   "bg-blue-500",
  observation: "bg-emerald-500",
  known_issue: "bg-amber-500",
  reference:   "bg-gray-500",
  tip:         "bg-emerald-500",
};

function getCoverImage(item) {
  if (item.cover_image_url) return item.cover_image_url;
  if (item.image_urls?.length > 0) return item.image_urls[0];
  if (item.media_urls?.length > 0) return item.media_urls[0];
  return null;
}

function getExcerpt(item) {
  if (item.summary) return item.summary;
  if (item.content_html) {
    const text = item.content_html.replace(/<[^>]*>/g, '').trim();
    return text.length > 120 ? text.slice(0, 120) + '…' : text;
  }
  return null;
}

export default function KnowledgeCompactRow({ item, onClick, entryCount }) {
  const postType = item.post_type || item.type || 'procedure';
  const dot = POST_DOT[postType] || POST_DOT.procedure;
  const coverImg = getCoverImage(item);
  const excerpt = getExcerpt(item);
  const imageCount = (item.image_urls?.length || 0) + (item.media_urls?.length || 0);
  const isObsolete = item.is_obsolete;
  const isDraft = item.status === 'draft';

  return (
    <div
      onClick={() => onClick(item)}
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b border-gray-800/30 group",
        isObsolete ? "opacity-40" : "hover:bg-gray-800/40"
      )}
    >
      {/* Thumbnail */}
      <div className="w-[88px] h-[66px] shrink-0 rounded-md overflow-hidden bg-gray-800/60">
        {coverImg ? (
          <img src={coverImg} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className={cn("w-3 h-3 rounded-full", dot)} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Line 1: Title + badges */}
        <div className="flex items-center gap-1.5 min-w-0">
          {item.is_master_procedure && <Crown className="w-3 h-3 text-red-400 shrink-0" />}
          {item.is_pinned && !item.is_master_procedure && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}
          <span className={cn(
            "text-sm font-medium text-white truncate group-hover:text-red-400 transition-colors",
            isObsolete && "line-through text-gray-500"
          )}>
            {item.title}
          </span>
          {isDraft && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400 shrink-0">Draft</span>}
          {item.warnings?.length > 0 && (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          )}
        </div>

        {/* Line 2: Excerpt */}
        {excerpt && (
          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{excerpt}</p>
        )}

        {/* Line 3: Metadata */}
        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-600">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
          {typeof entryCount === 'number' && entryCount > 0 && (
            <span className="flex items-center gap-0.5">
              <ListOrdered className="w-3 h-3" /> {entryCount}
            </span>
          )}
          {imageCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Camera className="w-3 h-3" /> {imageCount}
            </span>
          )}
          {item.updated_date && (
            <span className="flex items-center gap-0.5 ml-auto">
              <Clock className="w-3 h-3" />
              {format(new Date(item.updated_date), 'MMM d')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}