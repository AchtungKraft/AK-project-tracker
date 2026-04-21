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
      className="group block rounded-xl border border-gray-700 hover:border-gray-500 overflow-hidden transition-all bg-gray-800/40 hover:bg-gray-800"
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

// ── Compact row for non-media links (with OG thumbnail support) ──
function CompactLinkRow({ link }) {
  const href = link.url?.startsWith('http') ? link.url : `https://${link.url}`;
  const domain = getDomain(href);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  const hasThumb = !!link.previewImage;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800/80 transition-colors"
    >
      {hasThumb ? (
        <div className="w-8 h-8 rounded-lg shrink-0 overflow-hidden bg-gray-700/40">
          <img src={link.previewImage} alt="" loading="lazy" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg bg-gray-700/40 flex items-center justify-center shrink-0 overflow-hidden">
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4"
            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
          />
          <div className="w-4 h-4 items-center justify-center hidden">
            <LinkIcon className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-400 group-hover:text-blue-300 truncate">
          {link.title}
        </p>
        {link.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{link.description}</p>
        )}
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{domain}</p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 shrink-0" />
    </a>
  );
}

export default function LinkPreviewGrid({ links, showHeader = false }) {
  if (!links || links.length === 0) return null;

  const mediaLinks = links.filter(l => !!l.previewImage);
  const compactLinks = links.filter(l => !l.previewImage);

  const content = (
    <div className="space-y-3">
      {showHeader && (
        <p className="text-[10px] uppercase tracking-widest text-gray-500">References</p>
      )}

      {/* Media cards */}
      {mediaLinks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {mediaLinks.map((link, idx) => (
            <MediaCard key={link.url + idx} link={link} />
          ))}
        </div>
      )}

      {/* Compact link rows */}
      {compactLinks.length > 0 && (
        <div className="flex flex-col divide-y divide-gray-700/50 overflow-hidden">
          {compactLinks.map((link, idx) => (
            <CompactLinkRow key={link.url + idx} link={link} />
          ))}
        </div>
      )}
    </div>
  );

  if (showHeader) {
    return (
      <div className="rounded-lg border border-gray-700/60 bg-gray-900/20 p-3">
        {content}
      </div>
    );
  }

  return content;
}