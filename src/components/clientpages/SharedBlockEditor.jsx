import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import BlockEditorInline from "./BlockEditorInline";

const CATEGORIES = ['pricing', 'process', 'materials', 'faq', 'sales', 'legal', 'general', 'onboarding'];
const TYPES = ['text', 'media', 'links', 'files', 'cta'];

function getDefaultData(type) {
  switch (type) {
    case 'text': return { content: '' };
    case 'media': return { asset_ids: [], layout: 'grid' };
    case 'links': return { items: [] };
    case 'files': return { asset_ids: [], allow_download: true };
    case 'cta': return { label: '', action_type: 'link', value: '' };
    default: return {};
  }
}

export default function SharedBlockEditor({ blockId, projectId, usageCount, onClose, onSaved }) {
  const isNew = !blockId;

  const { data: existingBlock, isLoading } = useQuery({
    queryKey: ['sharedBlock', blockId],
    queryFn: async () => {
      const blocks = await base44.entities.SharedBlock.filter({ id: blockId });
      return blocks[0];
    },
    enabled: !!blockId,
  });

  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [category, setCategory] = useState('general');
  const [scope, setScope] = useState('global');
  const [data, setData] = useState(getDefaultData('text'));

  useEffect(() => {
    if (existingBlock) {
      setName(existingBlock.name || '');
      setType(existingBlock.type || 'text');
      setCategory(existingBlock.category || 'general');
      setScope(existingBlock.scope || 'global');
      setData(existingBlock.data || getDefaultData(existingBlock.type || 'text'));
    }
  }, [existingBlock]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name, type, category, scope, data, project_id: scope === 'project' ? projectId : null };
      return blockId
        ? base44.entities.SharedBlock.update(blockId, payload)
        : base44.entities.SharedBlock.create(payload);
    },
    onSuccess: () => onSaved(),
  });

  if (blockId && isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  const fakeBlock = { type, data, source_type: 'inline' };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Create Shared Block' : 'Edit Shared Block'}</DialogTitle>
        </DialogHeader>

        {!isNew && usageCount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-amber-900/30 border border-amber-500/40 rounded-lg text-xs text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            This block is used in {usageCount} page{usageCount !== 1 ? 's' : ''}. Changes update everywhere.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-gray-400">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="Block name" className="bg-gray-800 border-gray-700 text-white mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400">Type</Label>
              <Select value={type} onValueChange={v => { setType(v); setData(getDefaultData(v)); }} disabled={!isNew}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-gray-400 mb-2 block">Content</Label>
            <BlockEditorInline block={fakeBlock} onChange={setData} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300">Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white">
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {isNew ? 'Create' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}