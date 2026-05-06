import React from "react";
import { ClipboardList, AlertTriangle, Package, Image, ListChecks, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

function Metric({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700/50 min-w-[120px]">
      <Icon className={cn("w-4 h-4 shrink-0", color)} />
      <div>
        <div className="text-white text-sm font-bold leading-none">{value}</div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}

export default function SubsystemSummaryStrip({ items, partLinksCount, taskLinksCount, notesCount }) {
  const procedures = items.filter(i => i.type === 'procedure' || i.type === 'guide' || i.type === 'checklist').length;
  const issues = items.reduce((sum, i) => sum + (i.known_issues?.length || 0), 0);
  const mediaCount = items.reduce((sum, i) => sum + (i.media_urls?.length || 0) + (i.content_blocks?.filter(b => b.type === 'image' || b.type === 'gallery' || b.type === 'video').length || 0), 0);
  const warnings = items.reduce((sum, i) => sum + (i.warnings?.length || 0), 0);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <Metric icon={ClipboardList} label="Procedures" value={procedures} color="text-blue-400" />
      <Metric icon={Package} label="Related Parts" value={partLinksCount} color="text-cyan-400" />
      <Metric icon={AlertTriangle} label="Known Issues" value={issues} color="text-amber-400" />
      {warnings > 0 && <Metric icon={AlertTriangle} label="Warnings" value={warnings} color="text-red-400" />}
      <Metric icon={Image} label="Media" value={mediaCount} color="text-purple-400" />
      <Metric icon={ListChecks} label="Linked Tasks" value={taskLinksCount} color="text-green-400" />
      <Metric icon={FolderOpen} label="Observations" value={notesCount} color="text-yellow-400" />
    </div>
  );
}