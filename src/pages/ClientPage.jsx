import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import BlockRenderer from "@/components/clientpages/BlockRenderer";

export default function ClientPage() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  const pageSlug = urlParams.get('page');

  const { data: pageData, isLoading, error } = useQuery({
    queryKey: ['publicClientPage', slug, pageSlug],
    queryFn: async () => {
      const res = await base44.functions.invoke('publicClientPage', { slug, page_slug: pageSlug });
      return res.data;
    },
    enabled: !!slug && !!pageSlug,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  if (!slug || !pageSlug) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center text-white">
        <p>Missing page parameters.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  if (error || !pageData?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center text-gray-400">
        <div className="text-center space-y-4">
          <p className="text-lg">Page not found</p>
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("ClientProjects") + `?slug=${slug}`)}
            className="border-gray-700 text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const { page, blocks, project } = pageData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <div className="border-b border-gray-800 bg-black/40 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <img
            src="https://achtungkraft.com/cdn/shop/files/AchtungLogoSticker_39633eb9-a276-4e81-8376-b8fef51b08d6.png"
            alt="Ächtung Kraft"
            className="h-6"
          />
          {project && (
            <span className="text-xs text-gray-500">• {project.name}</span>
          )}
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-2">
        <h1 className="text-3xl font-bold text-white">{page.title}</h1>
        {page.short_description && (
          <p className="text-gray-400 text-base">{page.short_description}</p>
        )}

        <div className="border-t border-gray-800 mt-6 pt-2">
          {(blocks || []).map(block => (
            <BlockRenderer
              key={block.id}
              block={block}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 pt-6 mt-8">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("ClientProjects") + `?slug=${slug}`)}
            className="border-gray-700 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
          </Button>
        </div>
      </div>
    </div>
  );
}