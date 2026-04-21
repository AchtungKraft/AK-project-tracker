import React from "react";
import { ExternalLink, Link as LinkIcon } from "lucide-react";

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function LinkRow({ link }) {
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
        <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden bg-gray-700/40">
          <img src={link.previewImage} alt="" loading="lazy" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-700/40 flex items-center justify-center shrink-0 overflow-hidden">
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

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/20 divide-y divide-gray-700/50 overflow-hidden">
      {showHeader && (
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-gray-500">References</p>
        </div>
      )}
      {links.map((link, idx) => (
        <LinkRow key={link.url + idx} link={link} />
      ))}
    </div>
  );
}