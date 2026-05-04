import React, { useState, useCallback, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Plus, Send, Eye, GripVertical, Trash2, Loader2, Unlink, Share2
} from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import BlockEditorInline from "./BlockEditorInline";
import AddBlockPopover from "./AddBlockPopover";
import AddSharedBlockPopover from "./AddSharedBlockPopover";
import lodash from "lodash";

export default function PageEditorDrawer({ pageId, onClose }) {
  const queryClient = useQueryClient();

  const { data: page, isLoading: loadingPage } = useQuery({
    queryKey: ['clientPage', pageId],
    queryFn: async () => {
      const pages = await base44.entities.ClientPage.filter({ id: pageId });
      return pages[0];
    },
    enabled: !!pageId,
  });

  const { data: blocks = [], isLoading: loadingBlocks } = useQuery({
    queryKey: ['pageBlocks', pageId],
    queryFn: () => base44.entities.PageBlock.filter({ page_id: pageId }),
    enabled: !!pageId,
  });

  const { data: allSharedBlocks = [] } = useQuery({
    queryKey: ['sharedBlocks'],
    queryFn: () => base44.entities.SharedBlock.list(),
    staleTime: 30000,
  });

  const sharedBlocksMap = useMemo(() => {
    const map = {};
    allSharedBlocks.forEach(sb => { map[sb.id] = sb; });
    return map;
  }, [allSharedBlocks]);

  const sortedBlocks = useMemo(() =>
    [...blocks].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [blocks]
  );

  // Page field updates with debounce
  const updatePageMutation = useMutation({
    mutationFn: ({ field, value }) => base44.entities.ClientPage.update(pageId, { [field]: value }),
  });

  const debouncedUpdatePage = useCallback(
    lodash.debounce((field, value) => {
      updatePageMutation.mutate({ field, value });
    }, 800),
    [pageId]
  );

  // Block mutations
  const addBlockMutation = useMutation({
    mutationFn: (blockData) => base44.entities.PageBlock.create(blockData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] }),
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PageBlock.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] }),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id) => base44.entities.PageBlock.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] }),
  });

  const handleAddBlock = (type) => {
    const maxOrder = sortedBlocks.length > 0
      ? Math.max(...sortedBlocks.map(b => b.order || 0))
      : -1;
    addBlockMutation.mutate({
      page_id: pageId,
      type,
      order: maxOrder + 1,
      source_type: 'inline',
      data: getDefaultBlockData(type),
    });
  };

  const handleAddSharedBlock = (sharedBlock) => {
    const maxOrder = sortedBlocks.length > 0
      ? Math.max(...sortedBlocks.map(b => b.order || 0))
      : -1;
    addBlockMutation.mutate({
      page_id: pageId,
      type: sharedBlock.type,
      order: maxOrder + 1,
      source_type: 'shared',
      shared_block_id: sharedBlock.id,
    });
  };

  const handleDetachSharedBlock = (block) => {
    const shared = sharedBlocksMap[block.shared_block_id];
    if (!shared) return;
    updateBlockMutation.mutate({
      id: block.id,
      data: { source_type: 'inline', shared_block_id: null, data: shared.data },
    });
    toast.success('Detached from shared block');
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sortedBlocks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    reordered.forEach((block, idx) => {
      if (block.order !== idx) {
        base44.entities.PageBlock.update(block.id, { order: idx });
      }
    });
    queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] });
  };

  const handlePublish = () => {
    updatePageMutation.mutate({ field: 'status', value: 'published' }, {
      onSuccess: () => {
        toast.success('Page published');
        queryClient.invalidateQueries({ queryKey: ['clientPage', pageId] });
      }
    });
  };

  const handleUnpublish = () => {
    updatePageMutation.mutate({ field: 'status', value: 'draft' }, {
      onSuccess: () => {
        toast.success('Page unpublished');
        queryClient.invalidateQueries({ queryKey: ['clientPage', pageId] });
      }
    });
  };

  const debouncedBlockUpdate = useCallback(
    lodash.debounce((blockId, data) => {
      updateBlockMutation.mutate({ id: blockId, data: { data } });
    }, 600),
    []
  );

  if (loadingPage || loadingBlocks) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-2xl bg-gray-900 border-gray-700 text-white p-0">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!page) return null;

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-gray-900 border-gray-700 text-white p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-800 p-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white">Edit Page</SheetTitle>
            <div className="flex items-center gap-2">
              <Badge className={page.status === 'published'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'}>
                {page.status}
              </Badge>
              {page.status === 'published' ? (
                <Button size="sm" variant="outline" onClick={handleUnpublish}
                  className="border-gray-700 text-gray-300 text-xs">Unpublish</Button>
              ) : (
                <Button size="sm" onClick={handlePublish}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1">
                  <Send className="w-3 h-3" /> Publish
                </Button>
              )}
            </div>
          </div>

          <Input
            defaultValue={page.title}
            onChange={e => debouncedUpdatePage('title', e.target.value)}
            className="bg-gray-800 border-gray-700 text-white text-lg font-semibold"
            placeholder="Page title"
          />
          <Textarea
            defaultValue={page.short_description || ''}
            onChange={e => debouncedUpdatePage('short_description', e.target.value)}
            className="bg-gray-800 border-gray-700 text-white h-12 text-sm"
            placeholder="Short description"
          />
          <div className="flex gap-2">
            <Select defaultValue={page.visibility || 'portal'}
              onValueChange={v => updatePageMutation.mutate({ field: 'visibility', value: v })}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portal">Portal Only</SelectItem>
                <SelectItem value="public_link">Public Link</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Blocks */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="blocks">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {sortedBlocks.map((block, index) => (
                    <Draggable key={block.id} draggableId={block.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`bg-gray-800/60 border rounded-lg ${
                            snapshot.isDragging ? 'border-red-500 shadow-lg' : 'border-gray-700'
                          }`}
                        >
                          {/* Block header */}
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50">
                            <div {...provided.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
                            </div>
                            <Badge variant="outline" className="border-gray-600 text-gray-400 text-[10px]">
                              {block.type}
                            </Badge>
                            {block.source_type === 'shared' && (
                              <>
                                <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">
                                  <Share2 className="w-2.5 h-2.5 mr-1" />
                                  {sharedBlocksMap[block.shared_block_id]?.name || 'Shared'}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500"
                                  onClick={() => handleDetachSharedBlock(block)} title="Detach">
                                  <Unlink className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            <div className="flex-1" />
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-red-400"
                              onClick={() => deleteBlockMutation.mutate(block.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>

                          {/* Block content editor */}
                          <div className="p-3">
                            {block.source_type === 'shared' ? (
                              <p className="text-xs text-gray-500 italic">
                                Content from shared block: {sharedBlocksMap[block.shared_block_id]?.name}
                              </p>
                            ) : (
                              <BlockEditorInline
                                block={block}
                                onChange={(data) => debouncedBlockUpdate(block.id, data)}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Add block controls */}
          <div className="flex items-center gap-2 pt-2">
            <AddBlockPopover onAdd={handleAddBlock} />
            <AddSharedBlockPopover
              sharedBlocks={allSharedBlocks}
              onAdd={handleAddSharedBlock}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function getDefaultBlockData(type) {
  switch (type) {
    case 'text': return { content: '' };
    case 'media': return { asset_ids: [], layout: 'grid' };
    case 'links': return { items: [] };
    case 'files': return { asset_ids: [], allow_download: true };
    case 'cta': return { label: '', action_type: 'link', value: '' };
    default: return {};
  }
}