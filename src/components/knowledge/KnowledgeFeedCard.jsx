import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Crown, Clock } from "lucide-react";
import { format } from "date-fns";

const POST_TYPE_CONFIG = {
  procedure:   { label: "Procedure", dot: "bg-blue-500" },
  observation: { label: "Note",      dot: "bg-emerald-500" },
  known_issue: { label: "Warning",   dot: "bg-amber-500" },
  reference:   { label: "Reference", dot: "bg-gray-500" },
  tip:         { label: "Note",      dot: "bg-emerald-500" },
};

export { POST_TYPE_CONFIG };

function getCoverImage(item) {
  if (item.cover_image_url) return item.cover_image_url;
  if (item.image_urls?.length > 0) return item.image_urls[0];
  if (item.media_urls?.length > 0) return item.media_urls[0];
  if (item.content_html) {
    const match = item.content_html.match(/<img[^>]+src="([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

function getExcerpt(item) {
  if (item.summary) return item.summary;
  if (item.content_html) {
    const text = item.content_html.replace(/<[^>]*>/g, '').trim();
    return text.length > 140 ? text.slice(0, 140) + '…' : text;
  }
  return null;
}

export { getCoverImage, getExcerpt };

export default function KnowledgeFeedCard({ item, onItemClick, partLinks, taskLinks, parts, compact, entryCount }) {
  const postType = item.post_type || item.type || 'procedure';
  const config = POST_TYPE_CONFIG[postType] || POST_TYPE_CONFIG.procedure;
  const coverImg = getCoverImage(item);
  const excerpt = getExcerpt(item);
  const imageCount = (item.image_urls?.length || 0) + (item.media_urls?.length || 0);
  const isPinned = item.is_pinned;
  const isMaster = item.is_master_procedure;
  const isObsolete = item.is_obsolete;
  const isArchived = item.status === 'archived';

  // Resolve part names for chips
  const partNames = (partLinks || []).map(link => {
    const part = parts?.find(p => p.id === link.part_id);
    return part?.part_name || part?.name || null;
  }).filter(Boolean).slice(0, 4);

  const relatedTaskCount = taskLinks?.length || 0;

  return (
    <div
      onClick={() => onItemClick(item)}
      className={cn(
        "rounded-xl overflow-hidden border transition-all cursor-pointer group",
        isObsolete ? "border-gray-800/40 bg-gray-900/20 opacity-50" :
        isMaster ? "border-red-800/40 bg-gray-900/60" :
        "border-gray-800/40 bg-gray-900/30 hover:bg-gray-900/50"
      )}
    >
      {/* Cover Image */}
      {coverImg && !compact && (
        <div className={cn("w-full overflow-hidden bg-gray-900", isMaster ? "h-40 md:h-52" : "h-32 md:h-40")}>
          <img
            src={coverImg}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        </div>
      )}

      {/* Compact: thumbnail on left */}
      {coverImg && compact && (
        <div className="flex">
          <div className="w-20 h-20 shrink-0 overflow-hidden bg-gray-800">
            <img src={coverImg} alt="" loading="lazy" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 p-3 min-w-0">
            <h3 className="text-sm font-medium text-white line-clamp-1 group-hover:text-red-400 transition-colors">{item.title}</h3>
            {excerpt && <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{excerpt}</p>}
            <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
              <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
              <span>{config.label}</span>
              {item.updated_date && <span>{format(new Date(item.updated_date), 'MMM d')}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Full card content */}
      {!compact && (
        <div className="p-3 md:p-4">
          {/* Status — single line, minimal */}
          <div className="flex items-center gap-1.5 mb-1 text-[10px]">
            <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
            <span className="text-gray-500">{config.label}</span>
            {isMaster && <span className="text-red-400 font-semibold uppercase tracking-wide">Procedure</span>}
            {isObsolete && <span className="text-gray-500">Obsolete</span>}
            {isArchived && <span className="text-gray-500">Archived</span>}
            {item.status === 'draft' && <span className="text-yellow-500">Draft</span>}
          </div>

          {/* Title */}
          <h3 className={cn(
            "font-semibold leading-snug mb-1 group-hover:text-red-400 transition-colors line-clamp-2",
            isMaster ? "text-base md:text-lg text-white" : "text-sm md:text-base text-white",
            isObsolete && "line-through text-gray-500"
          )}>
            {item.title}
          </h3>

          {/* Excerpt */}
          {excerpt && (
            <p className="text-xs text-gray-500 line-clamp-2 mb-2">{excerpt}</p>
          )}

          {/* Tags + parts — compact, no badge borders */}
          {(item.vehicle_tags?.length > 0 || partNames.length > 0) && (
            <div className="flex items-center gap-1 flex-wrap mb-2 text-[10px]">
              {item.vehicle_tags?.slice(0, 3).map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-400">{tag}</span>
              ))}
              {partNames.map(name => (
                <span key={name} className="px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400">{name}</span>
              ))}
            </div>
          )}

          {/* Meta — minimal */}
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            {typeof entryCount === 'number' && entryCount > 0 && (
              <span>{entryCount} steps</span>
            )}
            {imageCount > 0 && (
              <span>{imageCount} photos</span>
            )}
            <span className="ml-auto">
              {item.updated_date ? format(new Date(item.updated_date), 'MMM d') : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}