import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lightbulb, AlertTriangle, Eye, Image, FileText, Package, Link, FolderOpen } from "lucide-react";
import InlineContributionModal from "./InlineContributionModal";

const ACTIONS = [
  { key: 'observation', icon: Eye, label: 'Observation', color: 'text-blue-400 hover:bg-blue-900/30' },
  { key: 'tip', icon: Lightbulb, label: 'Tip', color: 'text-yellow-400 hover:bg-yellow-900/30' },
  { key: 'issue', icon: AlertTriangle, label: 'Issue', color: 'text-amber-400 hover:bg-amber-900/30' },
  { key: 'warning', icon: AlertTriangle, label: 'Warning', color: 'text-red-400 hover:bg-red-900/30' },
  { key: 'media', icon: Image, label: 'Media', color: 'text-purple-400 hover:bg-purple-900/30' },
  { key: 'pdf', icon: FileText, label: 'PDF', color: 'text-red-300 hover:bg-red-900/30' },
  { key: 'part', icon: Package, label: 'Part', color: 'text-cyan-400 hover:bg-cyan-900/30' },
  { key: 'link', icon: Link, label: 'Link', color: 'text-blue-300 hover:bg-blue-900/30' },
];

export default function QuickAddActions({ knowledgeItemId, onItemUpdated }) {
  const [activeAction, setActiveAction] = useState(null);

  return (
    <>
      <div className="border-t border-gray-700/50 pt-3 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">Quick Add</p>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map(action => (
            <Button
              key={action.key}
              variant="ghost"
              size="sm"
              onClick={() => setActiveAction(action.key)}
              className={`h-7 text-xs gap-1 border border-gray-700/50 ${action.color}`}
            >
              <action.icon className="w-3 h-3" />
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {activeAction && (
        <InlineContributionModal
          actionType={activeAction}
          knowledgeItemId={knowledgeItemId}
          onClose={() => setActiveAction(null)}
          onSuccess={() => {
            setActiveAction(null);
            onItemUpdated?.();
          }}
        />
      )}
    </>
  );
}