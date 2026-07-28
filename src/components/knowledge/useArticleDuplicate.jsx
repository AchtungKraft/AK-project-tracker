import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { KNOWLEDGE_QUERY_KEYS } from "./knowledgeHelpers";

/**
 * Hook to duplicate a complete article with all its entries.
 * Creates a new BuildKnowledgeItem + copies all active ProcedureEntry records.
 */
export default function useArticleDuplicate() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (sourceArticle) => {
      // 1. Create the new article
      const newArticle = await base44.entities.BuildKnowledgeItem.create({
        title: `Copy of ${sourceArticle.title}`,
        slug: `copy-of-${(sourceArticle.slug || sourceArticle.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
        post_type: sourceArticle.post_type || sourceArticle.type || 'procedure',
        type: sourceArticle.post_type || sourceArticle.type || 'procedure',
        category_id: sourceArticle.category_id || '',
        subcategory_id: sourceArticle.subcategory_id || '',
        vehicle_tags: sourceArticle.vehicle_tags || [],
        summary: sourceArticle.summary || '',
        content_html: sourceArticle.content_html || '',
        image_urls: sourceArticle.image_urls || [],
        reference_url: sourceArticle.reference_url || '',
        cover_image_url: sourceArticle.cover_image_url || '',
        is_pinned: false,
        is_master_procedure: sourceArticle.is_master_procedure || false,
        is_obsolete: false,
        superseded_by_id: '',
        parent_procedure_id: sourceArticle.parent_procedure_id || '',
        status: 'draft',
        version: 1,
        changelog: [],
        attachments: sourceArticle.attachments || [],
      });

      // 2. Copy all active entries
      const sourceEntries = await base44.entities.ProcedureEntry.filter(
        { procedure_id: sourceArticle.id }, 'order_index'
      );
      const activeEntries = sourceEntries.filter(
        e => (e.lifecycle_state || 'active') !== 'archived'
      );

      if (activeEntries.length > 0) {
        const newEntries = activeEntries.map((entry, idx) => ({
          procedure_id: newArticle.id,
          headline: entry.headline || '',
          entry_type: entry.entry_type || 'step',
          content_html: entry.content_html || '',
          image_urls: entry.image_urls || [],
          reference_url: entry.reference_url || '',
          order_index: idx,
          lifecycle_state: 'active',
          part_ids: entry.part_ids || [],
          group_label: entry.group_label || '',
        }));
        await base44.entities.ProcedureEntry.bulkCreate(newEntries);
      }

      return newArticle;
    },
    onSuccess: (newArticle) => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEYS.articles });
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEYS.allEntries });
      toast({ title: "Article duplicated", description: `"${newArticle.title}" created as draft` });
      navigate(`/buildknowledge/procedure?id=${newArticle.id}`);
    },
    onError: () => {
      toast({ title: "Duplication failed", description: "Could not duplicate the article", variant: "destructive" });
    },
  });
}