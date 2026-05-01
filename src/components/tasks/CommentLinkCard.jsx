import React from "react";
import { ExternalLink, X } from "lucide-react";

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function CommentLinkCardEditable({ link, onRemove }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-800/80 rounded border border-gray-600 group">
      <ExternalLink className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{link.title || getDomain(link.url)}</p>
        {link.description && <p className="text-[10px] text-gray-400 truncate">{link.description}</p>}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-500 hover:text-red-400 flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function CommentLinkCardDisplay({ link }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700 hover:border-blue-500/50 hover:bg-gray-800 transition-colors group"
    >
      <ExternalLink className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0 group-hover:text-blue-300" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-blue-400 group-hover:text-blue-300 font-medium truncate">
          {link.title || getDomain(link.url)}
        </p>
        {link.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{link.description}</p>
        )}
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{getDomain(link.url)}</p>
      </div>
    </a>
  );
}