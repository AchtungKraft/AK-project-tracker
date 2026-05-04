import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Loader2, AlertTriangle } from "lucide-react";
import SharedBlockEditor from "./SharedBlockEditor";

const CATEGORIES = ['pricing', 'process', 'materials', 'faq', 'sales', 'legal', 'general', 'onboarding'];
const TYPES = ['text', 'media', 'links', 'files', 'cta'];

export default function SharedBlockLibraryModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: sharedBlocks = [], isLoading } = useQuery({
    queryKey: ['sharedBlocks'],
    queryFn: () => base44.entities.SharedBlock.list(),
  });

  // Count usage of each shared block
  const { data: allPageBlocks = [] } = useQuery({
    queryKey: ['allPageBlocks'],
    queryFn: () => base44.entities.PageBlock.list(),
    staleTime: 30000,
  });

  const usageCount = useMemo(() => {
    const counts = {};
    allPageBlocks.forEach(pb => {
      if (pb.source_type === 'shared' && pb.shared_block_id) {
        counts[pb.shared_block_id] = (counts[pb.shared_block_id] || 0) + 1;
      }
    });
    return counts;
  }, [allPageBlocks]);

  const filtered = useMemo(() => {
    return sharedBlocks.filter(sb => {
      if (filterCategory !== 'all' && sb.category !== filterCategory) return false;
      if (search && !sb.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [sharedBlocks, search, filterCategory]);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SharedBlock.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sharedBlocks'] }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Shared Block Library</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="bg-gray-800 border-gray-700 text-white pl-9" />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)}
            className="bg-red-600 hover:bg-red-700 text-white gap-1">
            <Plus className="w-3.5 h-3.5" /> New Block
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No shared blocks found</p>
          ) : filtered.map(sb => (
            <div key={sb.id} className="flex items-center gap-3 p-3 bg-gray-800/60 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm text-white truncate">{sb.name}</h4>
                  <Badge variant="outline" className="border-gray-600 text-gray-400 text-[10px]">{sb.type}</Badge>
                  {sb.category && (
                    <Badge variant="outline" className="border-gray-600 text-gray-500 text-[10px]">{sb.category}</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Used in {usageCount[sb.id] || 0} page{usageCount[sb.id] !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-white"
                  onClick={() => setEditingBlockId(sb.id)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-400"
                  onClick={() => {
                    if (usageCount[sb.id] > 0) {
                      if (!confirm(`This block is used in ${usageCount[sb.id]} page(s). Delete anyway?`)) return;
                    }
                    deleteMutation.mutate(sb.id);
                  }}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {(showCreate || editingBlockId) && (
          <SharedBlockEditor
            blockId={editingBlockId}
            projectId={projectId}
            usageCount={editingBlockId ? (usageCount[editingBlockId] || 0) : 0}
            onClose={() => { setEditingBlockId(null); setShowCreate(false); }}
            onSaved={() => {
              setEditingBlockId(null);
              setShowCreate(false);
              queryClient.invalidateQueries({ queryKey: ['sharedBlocks'] });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}