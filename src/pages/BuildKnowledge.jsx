import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, BookOpen, ClipboardList, AlertTriangle, FileText, Plus } from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import KnowledgeExplorerLayout from "@/components/knowledge/KnowledgeExplorerLayout";
import KnowledgeItemEditor from "@/components/knowledge/KnowledgeItemEditor";

export default function BuildKnowledge() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
    staleTime: 60000,
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setEditorOpen(true);
  };

  return (
    <>
      <MobileSafeAreaContainer>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                  BUILD KNOWLEDGE
                </h1>
                <p className="text-sm text-gray-400">Restoration procedures, guides, and operational intelligence</p>
              </div>
              <Button
                onClick={async () => {
                  setIsRefreshing(true);
                  await queryClient.invalidateQueries();
                  setIsRefreshing(false);
                }}
                variant="outline"
                size="sm"
                className="border-gray-700 text-white gap-2"
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            <KnowledgeExplorerLayout
              categories={categories}
              onItemEdit={handleEdit}
              onItemCreate={handleCreate}
            />
          </div>
        </div>
      </MobileSafeAreaContainer>

      <KnowledgeItemEditor
        item={editingItem}
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingItem(null); }}
        categories={categories}
      />
    </>
  );
}