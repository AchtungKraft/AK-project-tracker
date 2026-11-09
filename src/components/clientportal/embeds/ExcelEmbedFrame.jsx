import React from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { isAllowedEmbedUrl, openInExcelUrl, clampHeight } from "@/lib/excelEmbeds";

// Controlled, sandboxed iframe for an approved Microsoft Excel embed. The URL is re-checked
// against the allow-list on every render, so a forged stored value never renders.
// Microsoft enforces its own sharing permissions inside the frame.
export default function ExcelEmbedFrame({ embed, heightOverride }) {
  if (!embed || !isAllowedEmbedUrl(embed.url)) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-md border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
        <ShieldAlert className="w-4 h-4 shrink-0" /> This embedded content was blocked because its link is not an approved Microsoft Excel link.
      </div>
    );
  }
  const height = clampHeight(heightOverride ?? embed.height);
  const openUrl = openInExcelUrl(embed.url);
  return (
    <div className="my-3 w-full min-w-0">
      <div className="w-full overflow-hidden rounded-md border border-gray-700 bg-white max-h-[80vh]" style={{ height }}>
        <iframe
          src={embed.url}
          title={embed.title || "Excel workbook"}
          className="w-full h-full border-0 block"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads"
          allow="fullscreen; clipboard-write"
          allowFullScreen
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-gray-500">{embed.title || "Excel workbook"}</span>
        <a href={openUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-blue-400 hover:text-blue-300">
          Open in Excel <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}