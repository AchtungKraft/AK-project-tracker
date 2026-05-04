import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
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

  // ─── Editing guard: true while any input is focused ───
  const editingRef = useRef(false);

  // ─── Page data (server) ───
  const { data: serverPage, isLoading: loadingPage } = useQuery({
    queryKey: ['clientPage', pageId],
    queryFn: async () => {
      const pages = await base44.entities.ClientPage.filter({ id: pageId });
      return pages[0];
    },
    enabled: !!pageId,
  });

  // ─── Local page field state (controlled inputs) ───
  const [localTitle, setLocalTitle] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localStatus, setLocalStatus] = useState('draft');
  const [localVisibility, setLocalVisibility] = useState('portal');
  const pageInitRef = useRef(null);

  // Initialize local state from server page (only on first load or pageId change)
  if (serverPage && serverPage.id !== pageInitRef.current) {
    pageInitRef.current = serverPage.id;
    setLocalTitle(serverPage.title || '');
    setLocalDescription(serverPage.short_description || '');
    setLocalStatus(serverPage.status || 'draft');
    setLocalVisibility(serverPage.visibility || 'portal');
  }

  // Sync status/visibility from server ONLY when not editing
  useEffect(() => {
    if (serverPage && !editingRef.current) {
      setLocalStatus(serverPage.status || 'draft');
      setLocalVisibility(serverPage.visibility || 'portal');
    }
  }, [serverPage]);

  // ─── Blocks data (server) ───
  const { data: serverBlocks = [], isLoading: loadingBlocks } = useQuery({
    queryKey: ['pageBlocks', pageId],
    queryFn: () => base44.entities.PageBlock.filter({ page_id: pageId }),
    enabled: !!pageId,
  });

  // ─── Local blocks state ───
  const [localBlocks, setLocalBlocks] = useState(null);
  const blocks = localBlocks ?? serverBlocks;
  const serverBlocksIdRef = useRef(null);

  // Sync server blocks to local ONLY when block count changes (add/delete)
  // Never overwrite during editing
  const serverBlockIds = serverBlocks.map(b => b.id).sort().join(',');
  if (serverBlockIds !== serverBlocksIdRef.current) {
    serverBlocksIdRef.current = serverBlockIds;
    if (localBlocks !== null && !editingRef.current) {
      setLocalBlocks(null); // reset to let server take over
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

  // ─── Debounced page field save (fire-and-forget, NO invalidation) ───
  const pageSaveTimers = useRef({});
  const savePageField = useCallback((field, value) => {
    if (pageSaveTimers.current[field]) {
      clearTimeout(pageSaveTimers.current[field]);
    }
    pageSaveTimers.current[field] = setTimeout(() => {
      base44.entities.ClientPage.update(pageId, { [field]: value });
    }, 800);
  }, [pageId]);

  // ─── Page status mutation (publish/unpublish — these DO invalidate) ───
  const updateStatusMutation = useMutation({
    mutationFn: ({ field, value }) => base44.entities.ClientPage.update(pageId, { [field]: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientPage', pageId] }),
  });

  // ─── Block structural mutations (add/delete — these DO invalidate) ───
  const addBlockMutation = useMutation({
    mutationFn: (blockData) => base44.entities.PageBlock.create(blockData),
    onSuccess: () => {
      setLocalBlocks(null);
      queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id) => {
      // Optimistic removal from local state
      setLocalBlocks(prev => {
        const current = prev ?? serverBlocks;
        return current.filter(b => b.id !== id);
      });
      return base44.entities.PageBlock.delete(id);
    },
    onSuccess: () => {
      setLocalBlocks(null);
      queryClient.invalidateQueries({ queryKey: ['pageBlocks', pageId] });
    },
  });

  // ─── Block data save — per-block debounce, NO invalidation ───
  const blockSaveTimers = useRef({});
  const saveBlockToServer = useCallback((blockId, data) => {
    if (blockSaveTimers.current[blockId]) {
      clearTimeout(blockSaveTimers.current[blockId]);
    }
    blockSaveTimers.current[blockId] = setTimeout(() => {
      base44.entities.PageBlock.update(blockId, { data });
    }, 600);
  }, []);

  const handleBlockDataChange = useCallback((blockId, newData) => {
    // Local state update — immediate
    setLocalBlocks(prev => {
      const current = prev ?? serverBlocks;
      return current.map(b => b.id === blockId ? { ...b, data: newData } : b);
    });
    // Debounced server save — no invalidation
    saveBlockToServer(blockId, newData);
  }, [serverBlocks, saveBlockToServer]);

  // ─── Page field handlers ───
  const handleTitleChange = (e) => {
    const v = e.target.value;
    setLocalTitle(v);
    savePageField('title', v);
  };

  const handleDescriptionChange = (e) => {
    const v = e.target.value;
    setLocalDescription(v);
    savePageField('short_description', v);
  };

  const handleVisibilityChange = (v) => {
    setLocalVisibility(v);
    updateStatusMutation.mutate({ field: 'visibility', value: v });
  };

  // ─── Editing focus handlers ───
  const onFieldFocus = () => { editingRef.current = true; };
  const onFieldBlur = () => { editingRef.current = false; };

  // ─── Block structural handlers ───
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

    const updated = reordered.map((block, idx) => ({ ...block, order: idx }));
    setLocalBlocks(updated);

    reordered.forEach((block, idx) => {
      if (block.order !== idx) {
        base44.entities.PageBlock.update(block.id, { order: idx });
      }
    });
  };

  const handlePublish = () => {
    setLocalStatus('published');
    updateStatusMutation.mutate({ field: 'status', value: 'published' }, {
      onSuccess: () => toast.success('Page published'),
    });
  };

  const handleUnpublish = () => {
    setLocalStatus('draft');
    updateStatusMutation.mutate({ field: 'status', value: 'draft' }, {
      onSuccess: () => toast.success('Page unpublished'),
    });
  };

  // ─── Cleanup debounce timers on unmount ───
  useEffect(() => {
    return () => {
      Object.values(pageSaveTimers.current).forEach(clearTimeout);
      Object.values(blockSaveTimers.current).forEach(clearTimeout);
    };
  }, []);

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

  if (!serverPage) return null;

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-gray-900 border-gray-700 text-white p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-800 p-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white">Edit Page</SheetTitle>
            <div className="flex items-center gap-2">
              <Badge className={localStatus === 'published'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'}>
                {localStatus}
              </Badge>
              {localStatus === 'published' ? (
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
            value={localTitle}
            onChange={handleTitleChange}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
            className="bg-gray-800 border-gray-700 text-white text-lg font-semibold"
            placeholder="Page title"
          />
          <Textarea
            value={localDescription}
            onChange={handleDescriptionChange}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
            className="bg-gray-800 border-gray-700 text-white h-12 text-sm"
            placeholder="Short description"
          />
          <div className="flex gap-2">
            <Select value={localVisibility} onValueChange={handleVisibilityChange}>
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
                          <div className="p-3" onFocus={onFieldFocus} onBlur={onFieldBlur}>
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