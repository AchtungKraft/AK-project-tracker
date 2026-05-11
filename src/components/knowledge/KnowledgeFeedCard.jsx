import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Pin, Crown, Tag, Image, Clock, Package, ListChecks, Link2, Archive, AlertOctagon } from "lucide-react";
import { format } from "date-fns";

const POST_TYPE_CONFIG = {
  procedure:   { label: "Procedure",   dot: "bg-blue-500" },
  observation: { label: "Observation", dot: "bg-emerald-500" },
  known_issue: { label: "Known Issue", dot: "bg-amber-500" },
  reference:   { label: "Reference",   dot: "bg-purple-500" },
  tip:         { label: "Tip",         dot: "bg-yellow-500" },
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

export default function KnowledgeFeedCard({ item, onItemClick, partLinks, taskLinks, parts, compact }) {
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
        isObsolete ? "border-gray-700/50 bg-gray-900/30 opacity-60" :
        isMaster ? "border-red-700/60 bg-gradient-to-b from-gray-900 to-gray-900/80 ring-1 ring-red-800/40" :
        isPinned ? "border-amber-800/50 bg-gray-900/70" :
        "border-gray-800 bg-gray-900/40 hover:border-red-900/50"
      )}
    >
      {/* Cover Image — lazy loaded */}
      {coverImg && !compact && (
        <div className={cn("w-full overflow-hidden bg-gray-800", isMaster ? "h-44 md:h-56" : "h-36 md:h-44")}>
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
          {/* Status badges */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {isMaster && (
              <Badge className="bg-red-900/60 text-red-200 text-[10px] gap-1 border-0 font-bold">
                <Crown className="w-2.5 h-2.5" /> MASTER PROCEDURE
              </Badge>
            )}
            {isPinned && !isMaster && (
              <Badge className="bg-amber-900/40 text-amber-300 text-[10px] gap-1 border-0">
                <Pin className="w-2.5 h-2.5" /> PINNED
              </Badge>
            )}
            {isObsolete && (
              <Badge className="bg-gray-700/60 text-gray-400 text-[10px] gap-1 border-0">
                <AlertOctagon className="w-2.5 h-2.5" /> OBSOLETE
              </Badge>
            )}
            {isArchived && (
              <Badge className="bg-gray-700/60 text-gray-400 text-[10px] gap-1 border-0">
                <Archive className="w-2.5 h-2.5" /> ARCHIVED
              </Badge>
            )}
            {item.status === 'draft' && (
              <Badge variant="outline" className="border-yellow-600/50 text-yellow-500 text-[9px] py-0 h-4">Draft</Badge>
            )}
          </div>

          {/* Title */}
          <h3 className={cn(
            "font-semibold leading-snug mb-1 group-hover:text-red-400 transition-colors line-clamp-2",
            isMaster ? "text-base md:text-lg text-white" : "text-sm md:text-base text-white",
            isObsolete && "line-through"
          )}>
            {item.title}
          </h3>

          {/* Excerpt */}
          {excerpt && (
            <p className="text-xs md:text-sm text-gray-400 line-clamp-2 mb-2">{excerpt}</p>
          )}

          {/* Relationship Chips — part NAMES, not counts */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {item.vehicle_tags?.slice(0, 3).map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] border-gray-700 text-gray-300 gap-0.5 py-0 h-5">
                <Tag className="w-2.5 h-2.5" /> {tag}
              </Badge>
            ))}
            {partNames.map(name => (
              <Badge key={name} variant="outline" className="text-[10px] border-blue-900/50 text-blue-300 gap-0.5 py-0 h-5">
                <Package className="w-2.5 h-2.5" /> {name}
              </Badge>
            ))}
            {relatedTaskCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-300 gap-0.5 py-0 h-5">
                <ListChecks className="w-2.5 h-2.5" /> {relatedTaskCount} task{relatedTaskCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {item.reference_url && (
              <Badge variant="outline" className="text-[10px] border-gray-700 text-blue-400 gap-0.5 py-0 h-5">
                <Link2 className="w-2.5 h-2.5" /> ref
              </Badge>
            )}
          </div>

          {/* Meta row — field log style */}
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
              {config.label}
            </span>
            {imageCount > 0 && (
              <span className="flex items-center gap-0.5"><Image className="w-2.5 h-2.5" /> {imageCount} photo{imageCount !== 1 ? 's' : ''}</span>
            )}
            <span className="flex items-center gap-0.5 ml-auto">
              <Clock className="w-2.5 h-2.5" />
              {item.updated_date ? format(new Date(item.updated_date), 'MMM d, yyyy') : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}