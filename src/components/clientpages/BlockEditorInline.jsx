import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";
import ReactQuill from "react-quill";

function TextEditor({ data, onChange }) {
  return (
    <ReactQuill
      theme="snow"
      value={data?.content || ''}
      onChange={(content) => onChange({ ...data, content })}
      className="bg-gray-900 text-white [&_.ql-editor]:min-h-[100px] [&_.ql-toolbar]:bg-gray-800 [&_.ql-toolbar]:border-gray-700 [&_.ql-container]:border-gray-700"
    />
  );
}

function MediaEditor({ data, onChange }) {
  const [uploading, setUploading] = useState(false);
  const assetIds = data?.asset_ids || [];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const isVideo = file.type.startsWith('video/');
    const asset = await base44.entities.MediaAsset.create({
      file_url,
      type: isVideo ? 'video' : 'image',
      title: file.name,
    });
    onChange({ ...data, asset_ids: [...assetIds, asset.id] });
    setUploading(false);
  };

  const removeAsset = (id) => {
    onChange({ ...data, asset_ids: assetIds.filter(a => a !== id) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={data?.layout || 'grid'} onValueChange={v => onChange({ ...data, layout: v })}>
          <SelectTrigger className="bg-gray-900 border-gray-700 text-white w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grid">Grid</SelectItem>
            <SelectItem value="carousel">Carousel</SelectItem>
            <SelectItem value="hero">Hero</SelectItem>
          </SelectContent>
        </Select>
        <label className="cursor-pointer">
          <input type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
          <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 text-xs gap-1 pointer-events-none">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Upload
          </Button>
        </label>
      </div>
      {assetIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {assetIds.map(id => (
            <div key={id} className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-400">
              <span className="truncate max-w-[120px]">{id}</span>
              <button onClick={() => removeAsset(id)} className="text-red-400 hover:text-red-300">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LinksEditor({ data, onChange }) {
  const items = data?.items || [];

  const addItem = () => {
    onChange({ ...data, items: [...items, { title: '', url: '', description: '' }] });
  };

  const updateItem = (idx, field, value) => {
    const updated = items.map((item, i) => i === idx ? { ...item, [field]: value } : item);
    onChange({ ...data, items: updated });
  };

  const removeItem = (idx) => {
    onChange({ ...data, items: items.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input value={item.title} onChange={e => updateItem(i, 'title', e.target.value)}
              placeholder="Link title" className="bg-gray-900 border-gray-700 text-white h-8 text-xs" />
            <Input value={item.url} onChange={e => updateItem(i, 'url', e.target.value)}
              placeholder="https://..." className="bg-gray-900 border-gray-700 text-white h-8 text-xs" />
            <Input value={item.description || ''} onChange={e => updateItem(i, 'description', e.target.value)}
              placeholder="Description (optional)" className="bg-gray-900 border-gray-700 text-white h-8 text-xs" />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 shrink-0"
            onClick={() => removeItem(i)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}
        className="border-gray-700 text-gray-300 text-xs gap-1">
        <Plus className="w-3 h-3" /> Add Link
      </Button>
    </div>
  );
}

function FilesEditor({ data, onChange }) {
  const [uploading, setUploading] = useState(false);
  const assetIds = data?.asset_ids || [];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const asset = await base44.entities.MediaAsset.create({
      file_url,
      type: 'document',
      title: file.name,
    });
    onChange({ ...data, asset_ids: [...assetIds, asset.id] });
    setUploading(false);
  };

  const removeAsset = (id) => {
    onChange({ ...data, asset_ids: assetIds.filter(a => a !== id) });
  };

  return (
    <div className="space-y-2">
      <label className="cursor-pointer">
        <input type="file" className="hidden" onChange={handleUpload} />
        <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 text-xs gap-1 pointer-events-none">
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Upload File
        </Button>
      </label>
      {assetIds.length > 0 && (
        <div className="space-y-1">
          {assetIds.map(id => (
            <div key={id} className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-400">
              <span className="flex-1 truncate">{id}</span>
              <button onClick={() => removeAsset(id)} className="text-red-400">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CtaEditor({ data, onChange }) {
  return (
    <div className="space-y-2">
      <Input value={data?.label || ''} onChange={e => onChange({ ...data, label: e.target.value })}
        placeholder="Button label" className="bg-gray-900 border-gray-700 text-white h-8 text-xs" />
      <div className="flex gap-2">
        <Select value={data?.action_type || 'link'} onValueChange={v => onChange({ ...data, action_type: v })}>
          <SelectTrigger className="bg-gray-900 border-gray-700 text-white w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="link">Link</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
          </SelectContent>
        </Select>
        <Input value={data?.value || ''} onChange={e => onChange({ ...data, value: e.target.value })}
          placeholder={data?.action_type === 'email' ? 'email@example.com' : data?.action_type === 'phone' ? '+1...' : 'https://...'}
          className="bg-gray-900 border-gray-700 text-white h-8 text-xs flex-1" />
      </div>
    </div>
  );
}

const EDITORS = {
  text: TextEditor,
  media: MediaEditor,
  links: LinksEditor,
  files: FilesEditor,
  cta: CtaEditor,
};

export default function BlockEditorInline({ block, onChange }) {
  const Editor = EDITORS[block.type];
  if (!Editor) return <p className="text-xs text-gray-500">Unknown block type</p>;
  return <Editor data={block.data || {}} onChange={onChange} />;
}