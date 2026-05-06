import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";

const BLOCK_TYPES = [
  { value: "text", label: "Text" },
  { value: "heading", label: "Heading" },
  { value: "step", label: "Step" },
  { value: "warning", label: "Warning" },
  { value: "note", label: "Note" },
  { value: "image", label: "Image" },
  { value: "link", label: "Link" },
  { value: "checklist", label: "Checklist" },
];

function BlockEditor({ block, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const updateData = (key, value) => {
    onChange({ ...block, data: { ...block.data, [key]: value } });
  };

  const renderFields = () => {
    switch (block.type) {
      case 'text':
        return (
          <Textarea value={block.data?.text || ''} onChange={e => updateData('text', e.target.value)}
            placeholder="Enter text content..."
            className="bg-gray-800 border-gray-700 text-white min-h-[60px] text-sm" />
        );
      case 'heading':
        return (
          <div className="flex gap-2">
            <Select value={String(block.data?.level || 2)} onValueChange={v => updateData('level', parseInt(v))}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">H1</SelectItem>
                <SelectItem value="2">H2</SelectItem>
                <SelectItem value="3">H3</SelectItem>
              </SelectContent>
            </Select>
            <Input value={block.data?.text || ''} onChange={e => updateData('text', e.target.value)}
              placeholder="Heading text" className="bg-gray-800 border-gray-700 text-white flex-1" />
          </div>
        );
      case 'step':
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input value={block.data?.step_number || ''} onChange={e => updateData('step_number', e.target.value)}
                placeholder="#" className="bg-gray-800 border-gray-700 text-white w-16" />
              <Input value={block.data?.title || ''} onChange={e => updateData('title', e.target.value)}
                placeholder="Step title" className="bg-gray-800 border-gray-700 text-white flex-1" />
            </div>
            <Textarea value={block.data?.text || ''} onChange={e => updateData('text', e.target.value)}
              placeholder="Step instructions..."
              className="bg-gray-800 border-gray-700 text-white min-h-[40px] text-sm" />
            <Input value={block.data?.image_url || ''} onChange={e => updateData('image_url', e.target.value)}
              placeholder="Image URL (optional)" className="bg-gray-800 border-gray-700 text-white text-sm" />
            <Input value={block.data?.warning || ''} onChange={e => updateData('warning', e.target.value)}
              placeholder="Warning (optional)" className="bg-gray-800 border-gray-700 text-amber-400 text-sm" />
          </div>
        );
      case 'warning':
        return (
          <div className="flex gap-2">
            <Select value={block.data?.severity || 'warning'} onValueChange={v => updateData('severity', v)}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caution">Caution</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="danger">Danger</SelectItem>
              </SelectContent>
            </Select>
            <Input value={block.data?.text || ''} onChange={e => updateData('text', e.target.value)}
              placeholder="Warning text" className="bg-gray-800 border-gray-700 text-white flex-1" />
          </div>
        );
      case 'note':
        return (
          <Input value={block.data?.text || ''} onChange={e => updateData('text', e.target.value)}
            placeholder="Note text" className="bg-gray-800 border-gray-700 text-white" />
        );
      case 'image':
        return (
          <div className="space-y-2">
            <Input value={block.data?.url || ''} onChange={e => updateData('url', e.target.value)}
              placeholder="Image URL" className="bg-gray-800 border-gray-700 text-white" />
            <Input value={block.data?.caption || ''} onChange={e => updateData('caption', e.target.value)}
              placeholder="Caption (optional)" className="bg-gray-800 border-gray-700 text-white text-sm" />
          </div>
        );
      case 'link':
        return (
          <div className="space-y-2">
            <Input value={block.data?.url || ''} onChange={e => updateData('url', e.target.value)}
              placeholder="URL" className="bg-gray-800 border-gray-700 text-white" />
            <Input value={block.data?.title || ''} onChange={e => updateData('title', e.target.value)}
              placeholder="Link title" className="bg-gray-800 border-gray-700 text-white text-sm" />
          </div>
        );
      case 'checklist':
        return (
          <div className="space-y-1">
            {(block.data?.items || []).map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={item.text || ''} onChange={e => {
                  const items = [...(block.data?.items || [])];
                  items[i] = { ...items[i], text: e.target.value };
                  updateData('items', items);
                }} placeholder={`Item ${i + 1}`} className="bg-gray-800 border-gray-700 text-white text-sm flex-1" />
                <Button size="sm" variant="ghost" onClick={() => {
                  const items = (block.data?.items || []).filter((_, idx) => idx !== i);
                  updateData('items', items);
                }} className="text-gray-500 h-8 w-8 p-0">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => {
              updateData('items', [...(block.data?.items || []), { text: '', checked: false }]);
            }} className="text-gray-400 h-7 text-xs gap-1">
              <Plus className="w-3 h-3" /> Add Item
            </Button>
          </div>
        );
      default:
        return <p className="text-gray-500 text-sm">Unknown block type</p>;
    }
  };

  return (
    <div className="border border-gray-700/50 rounded-lg p-3 bg-gray-800/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{block.type}</span>
        <div className="ml-auto flex items-center gap-1">
          {!isFirst && (
            <Button size="sm" variant="ghost" onClick={onMoveUp} className="h-6 w-6 p-0 text-gray-500">
              <ArrowUp className="w-3 h-3" />
            </Button>
          )}
          {!isLast && (
            <Button size="sm" variant="ghost" onClick={onMoveDown} className="h-6 w-6 p-0 text-gray-500">
              <ArrowDown className="w-3 h-3" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onRemove} className="h-6 w-6 p-0 text-red-500">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {renderFields()}
    </div>
  );
}

export default function KnowledgeBlockEditor({ blocks, onChange }) {
  const [addType, setAddType] = React.useState("text");

  const addBlock = () => {
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: addType,
      order: blocks.length,
      data: addType === 'checklist' ? { items: [{ text: '', checked: false }] } : {},
    };
    onChange([...blocks, newBlock]);
  };

  const updateBlock = (index, updated) => {
    const next = [...blocks];
    next[index] = updated;
    onChange(next);
  };

  const removeBlock = (index) => {
    onChange(blocks.filter((_, i) => i !== index));
  };

  const moveBlock = (index, direction) => {
    const next = [...blocks];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <BlockEditor
          key={block.id}
          block={block}
          onChange={updated => updateBlock(i, updated)}
          onRemove={() => removeBlock(i)}
          onMoveUp={() => moveBlock(i, -1)}
          onMoveDown={() => moveBlock(i, 1)}
          isFirst={i === 0}
          isLast={i === blocks.length - 1}
        />
      ))}

      <div className="flex gap-2 items-center pt-2">
        <Select value={addType} onValueChange={setAddType}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLOCK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={addBlock} className="border-gray-700 gap-1 h-8 text-sm">
          <Plus className="w-3 h-3" /> Add Block
        </Button>
      </div>
    </div>
  );
}