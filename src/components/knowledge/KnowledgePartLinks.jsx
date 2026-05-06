import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

const REQ_STYLES = {
  required: "bg-red-600/20 text-red-400",
  optional: "bg-gray-600/20 text-gray-400",
  conditional: "bg-amber-600/20 text-amber-400",
};

export default function KnowledgePartLinks({ knowledgeItemId }) {
  const { data: links = [] } = useQuery({
    queryKey: ['knowledgePartLinks', knowledgeItemId],
    queryFn: () => base44.entities.BuildKnowledgePartLink.filter({ knowledge_item_id: knowledgeItemId }),
    enabled: !!knowledgeItemId,
  });

  const partIds = links.map(l => l.part_id).filter(Boolean);

  const { data: parts = [] } = useQuery({
    queryKey: ['partsByIds', partIds.join(',')],
    queryFn: async () => {
      if (partIds.length === 0) return [];
      // Fetch all parts and filter client-side
      const allParts = await base44.entities.Part.list();
      return allParts.filter(p => partIds.includes(p.id));
    },
    enabled: partIds.length > 0,
  });

  if (links.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5" /> Related Parts ({links.length})
      </h3>
      <div className="space-y-1">
        {links.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(link => {
          const part = parts.find(p => p.id === link.part_id);
          if (!part) return null;
          return (
            <div key={link.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
              <Package className="w-4 h-4 text-gray-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{part.name}</span>
                {link.install_notes && (
                  <p className="text-xs text-gray-400">{link.install_notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {link.estimated_qty && (
                  <span className="text-xs text-gray-400">×{link.estimated_qty}</span>
                )}
                <Badge className={cn("text-[10px]", REQ_STYLES[link.requirement] || REQ_STYLES.required)}>
                  {link.requirement}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}