import React, { useState, useCallback, useMemo, useRef } from "react";
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
  Plus, Send, Eye, GripVertical, Trash2, Loader2, Unlink, Share2, Lock
} from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import BlockEditorInline from "./BlockEditorInline";
import AddBlockPopover from "./AddBlockPopover";
import AddSharedBlockPopover from "./AddSharedBlockPopover";
import lodash from "lodash";

export default function PageEditorDrawer({ pageId, onClose }) {
  const queryClient = useQueryClient();

  // --- Page data ---
  const { data: page, isLoading: loadingPage } = useQuery({
    queryKey: ['clientPage', pageId],
    queryFn: async () => {
      const pages = await base44.entities.ClientPage.filter({ id: pageId });
      return pages[0];
    },
    enabled: !!pageId,
  });

  // --- Blocks data with local state to avoid refetch-on-edit ---
  const { data: serverBlocks = [], isLoading: loadingBlocks } = useQuery({
    queryKey: ['pageBlocks', pageId],
    queryFn: () => base44.entities.PageBlock.filter({ page_id: pageId }),
    enabled: !!pageId,
  });

  // Local blocks state — initialized from server, updated optimistically
  const [localBlocks, setLocalBlocks] = useState(null);
  const blocks = localBlocks ?? serverBlocks;

  // Sync server blocks into local state when they arrive (only if we haven't edited yet)
  const lastServerRef = useRef(null);
  if (serverBlocks !== lastServerRef.current && localBlocks === null) {
    lastServerRef.current = serverBlocks;
  }
  // When serverBlocks change from a refetch (add/delete), sync to local
  if (serverBlocks !== lastServerRef.current) {
    lastServerRef.current = serverBlocks;
    if (localBlocks !== null) {
      setLocalBlocks(null); // reset to server state
    }
  }

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

  // --- Page field mutations (no query invalidation — just fire-and-forget save) ---
  const savePageField = useCallback(
    lodash.debounce((field, value) => {
      base44.entities.ClientPage.update(pageId, { [field]: value });
    }, 800),
    [pageId]
  );

  // For status changes that need UI update
  const updatePageMutation = useMutation({
    mutationFn: ({ field, value }) => base44.entities.ClientPage.update(pageId, { [field]: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientPage', pageId] }),
  });

  // --- Block mutations ---
  const addBlockMutation = useMutation({
    mutationFn: (blockData) => base44.entities.PageBlock.create(blockData),
    onSuccess: () => {
      setLocalBlocks(null); // reset local so server data takes over
      queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id) => base44.entities.PageBlock.delete(id),
    onSuccess: () => {
      setLocalBlocks(null);
      queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] });
    },
  });

  // Block data update — optimistic local + debounced save, NO query invalidation
  const pendingSavesRef = useRef({});

  const saveBlockData = useCallback(
    lodash.debounce((blockId, data) => {
      base44.entities.PageBlock.update(blockId, { data });
    }, 600),
    []
  );

  const handleBlockDataChange = useCallback((blockId, newData) => {
    // Update local state immediately (optimistic)
    setLocalBlocks(prev => {
      const current = prev ?? serverBlocks;
      return current.map(b => b.id === blockId ? { ...b, data: newData } : b);
    });
    // Debounced save to server (no invalidation)
    saveBlockData(blockId, newData);
  }, [serverBlocks, saveBlockData]);

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
    // Optimistic local update
    setLocalBlocks(prev => {
      const current = prev ?? serverBlocks;
      return current.map(b => b.id === block.id
        ? { ...b, source_type: 'inline', shared_block_id: null, data: shared.data }
        : b
      );
    });
    base44.entities.PageBlock.update(block.id, {
      source_type: 'inline', shared_block_id: null, data: shared.data
    });
    toast.success('Detached from shared block');
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sortedBlocks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Optimistic reorder
    const updated = reordered.map((block, idx) => ({ ...block, order: idx }));
    setLocalBlocks(updated);

    // Save to server
    reordered.forEach((block, idx) => {
      if (block.order !== idx) {
        base44.entities.PageBlock.update(block.id, { order: idx });
      }
    });
  };

  const handlePublish = () => {
    updatePageMutation.mutate({ field: 'status', value: 'published' }, {
      onSuccess: () => toast.success('Page published'),
    });
  };

  const handleUnpublish = () => {
    updatePageMutation.mutate({ field: 'status', value: 'draft' }, {
      onSuccess: () => toast.success('Page unpublished'),
    });
  };

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
            onChange={e => savePageField('title', e.target.value)}
            className="bg-gray-800 border-gray-700 text-white text-lg font-semibold"
            placeholder="Page title"
          />
          <Textarea
            defaultValue={page.short_description || ''}
            onChange={e => savePageField('short_description', e.target.value)}
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
                              <div className="flex items-start gap-2 p-2.5 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                                <Lock className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                                <div className="text-xs text-blue-300 space-y-1">
                                  <p className="font-medium">
                                    Shared block: {sharedBlocksMap[block.shared_block_id]?.name || 'Unknown'}
                                  </p>
                                  <p className="text-blue-400/70">
                                    This is a shared block. Edit it in the Block Library, or detach it to customize independently.
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <BlockEditorInline
                                block={block}
                                onChange={(data) => handleBlockDataChange(block.id, data)}
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