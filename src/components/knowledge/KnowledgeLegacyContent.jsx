import React from "react";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import KnowledgeContentRenderer from "./KnowledgeContentRenderer";

export default function KnowledgeLegacyContent({ item }) {
  return (
    <div className="space-y-3">
      {/* Legacy block content */}
      {item.content_blocks?.length > 0 && (
        <KnowledgeContentRenderer blocks={item.content_blocks} />
      )}

      {/* Legacy warnings */}
      {item.warnings?.length > 0 && (
        <div className="space-y-2">
          {item.warnings.map(w => (
            <div key={w.id} className={cn("flex items-start gap-2 p-3 rounded-lg border",
              w.severity === 'danger' ? "bg-red-900/30 border-red-600/40 text-red-300" :
              w.severity === 'warning' ? "bg-amber-900/30 border-amber-600/40 text-amber-300" :
              "bg-yellow-900/30 border-yellow-600/40 text-yellow-300"
            )}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-sm">{w.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legacy known issues */}
      {item.known_issues?.length > 0 && (
        <div className="space-y-2">
          {item.known_issues.map(issue => (
            <div key={issue.id} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-sm font-medium text-white">{issue.title}</span>
              </div>
              {issue.description && <p className="text-xs text-gray-400 mb-1">{issue.description}</p>}
              {issue.resolution && <p className="text-xs text-green-400"><span className="font-semibold">Fix:</span> {issue.resolution}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Legacy tips */}
      {item.tips?.length > 0 && (
        <div className="space-y-2">
          {item.tips.map(tip => (
            <div key={tip.id} className="p-3 rounded-lg bg-yellow-900/15 border border-yellow-700/30">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-yellow-200">{tip.text}</p>
                  {tip.source && <p className="text-xs text-gray-500 mt-1">— {tip.source}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}