import React from "react";
import { ExternalLink, Play, Image as ImageIcon, Link as LinkIcon } from "lucide-react";

const TypeIcon = ({ type }) => {
  if (type === 'youtube') return <Play className="w-4 h-4" />;
  if (type === 'image') return <ImageIcon className="w-4 h-4" />;
  return <LinkIcon className="w-4 h-4" />;
};

function LinkPreviewCard({ link }) {
  const href = link.url?.startsWith('http') ? link.url : `https://${link.url}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-gray-800/60 border border-gray-700 rounded-lg overflow-hidden hover:border-gray-500 hover:bg-gray-800 transition-all"
    >
      {/* 16:9 preview area */}
      {link.previewImage ? (
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
      ) : (
        <div className="w-full aspect-video bg-gray-900/50 flex items-center justify-center">
          <TypeIcon type={link.type} />
        </div>
      )}

      {/* Title bar */}
      <div className="p-3 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-400 group-hover:text-blue-300 truncate">
            {link.title}
          </p>
          {link.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{link.description}</p>
          )}
          <p className="text-[10px] text-gray-500 mt-1 truncate">
            {new URL(href).hostname}
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 shrink-0 mt-0.5" />
      </div>
    </a>
  );
}

export default function LinkPreviewGrid({ links }) {
  if (!links || links.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      {links.map((link, idx) => (
        <LinkPreviewCard key={link.url + idx} link={link} />
      ))}
    </div>
  );
}