import React from "react";
import { ExternalLink, Play, Image as ImageIcon, Link as LinkIcon } from "lucide-react";

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ── Media card (YouTube, direct images — anything with a previewImage) ──
function MediaCard({ link }) {
  const href = link.url?.startsWith('http') ? link.url : `https://${link.url}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-gray-700 hover:border-gray-500 overflow-hidden transition-all bg-gray-800/60 hover:bg-gray-800"
    >
      <div className="relative w-full aspect-video bg-gray-900 overflow-hidden">
        <img
          src={link.previewImage}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {link.type === 'youtube' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg group-hover:bg-red-500 transition-colors">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 flex items-start gap-2 border-t border-gray-700/50">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-400 group-hover:text-blue-300 truncate">
            {link.title}
          </p>
          {link.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{link.description}</p>
          )}
          <p className="text-[10px] text-gray-500 mt-1 truncate">{getDomain(href)}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 shrink-0 mt-0.5" />
      </div>
    </a>
  );
}

// ── Compact row for non-media links ──
function CompactLinkRow({ link }) {
  const href = link.url?.startsWith('http') ? link.url : `https://${link.url}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-700 hover:border-gray-500 bg-gray-800/60 hover:bg-gray-800 transition-all"
    >
      <div className="w-8 h-8 rounded-lg bg-gray-700/60 flex items-center justify-center shrink-0 group-hover:bg-gray-700">
        <LinkIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-400 group-hover:text-blue-300 truncate">
          {link.title}
        </p>
        {link.description && (
          <p className="text-xs text-gray-500 truncate">{link.description}</p>
        )}
        <p className="text-[10px] text-gray-500 truncate">{getDomain(href)}</p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 shrink-0" />
    </a>
  );
}

export default function LinkPreviewGrid({ links }) {
  if (!links || links.length === 0) return null;

  const mediaLinks = links.filter(l => !!l.previewImage);
  const compactLinks = links.filter(l => !l.previewImage);

  return (
    <div className="mt-2 space-y-3">
      {/* Media cards in a grid */}
      {mediaLinks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mediaLinks.map((link, idx) => (
            <MediaCard key={link.url + idx} link={link} />
          ))}
        </div>
      )}

      {/* Non-media links as compact rows */}
      {compactLinks.length > 0 && (
        <div className="space-y-1.5">
          {compactLinks.map((link, idx) => (
            <CompactLinkRow key={link.url + idx} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}