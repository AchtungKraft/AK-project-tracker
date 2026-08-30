import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Save, X, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export default function ScopeItemEditor({
  requestId,
  categories = [],
  groups = [],
  onSave,
  onCancel,
  editItem = null,
  isMobile = false,
}) {
  const isEdit = !!editItem;
  const [title, setTitle] = useState(editItem?.title || "");
  const [description, setDescription] = useState(editItem?.description || "");
  const [categoryId, setCategoryId] = useState(editItem?.category_id || (categories[0]?.id || ""));
  const [groupId, setGroupId] = useState(editItem?.group_id || "");
  const [budgetMin, setBudgetMin] = useState(editItem?.budget_min ?? "");
  const [budgetMax, setBudgetMax] = useState(editItem?.budget_max ?? "");
  const [budgetNote, setBudgetNote] = useState(editItem?.budget_note || "");
  const [budgetTbd, setBudgetTbd] = useState(editItem?.budget_tbd || false);
  const [images, setImages] = useState(editItem?.images || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const availableGroups = groups.filter(g => g.category_id === categoryId);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
    setImages(prev => [...prev, ...results.map(r => r.file_url)]);
    setUploading(false);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!title.trim() || !categoryId || !groupId) return;
    setSaving(true);
    const data = {
      request_id: requestId,
      category_id: categoryId,
      group_id: groupId,
      title: title.trim(),
      description: description.trim() || null,
      budget_min: budgetTbd ? null : (budgetMin !== "" ? Number(budgetMin) : null),
      budget_max: budgetTbd ? null : (budgetMax !== "" ? Number(budgetMax) : null),
      budget_note: budgetNote.trim() || null,
      budget_tbd: budgetTbd,
      images: images.length > 0 ? images : null,
    };
    await onSave(data, editItem?.id);
    setSaving(false);
  };

  return (
    <div className="space-y-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
      <h4 className="text-sm font-semibold text-white">{isEdit ? 'Edit Item' : 'Add Scope Item'}</h4>
      
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Item title..."
        className="bg-gray-800 border-gray-700 text-white"
        autoFocus
      />
      
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description / context..."
        className="bg-gray-800 border-gray-700 text-white text-sm min-h-[60px] resize-none"
      />

      <div className="flex gap-2 flex-wrap">
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setGroupId(""); }}>
          <SelectTrigger className="w-40 h-8 bg-gray-800 border-gray-700 text-white text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-40 h-8 bg-gray-800 border-gray-700 text-white text-xs">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            {availableGroups.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Budget */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox checked={budgetTbd} onCheckedChange={setBudgetTbd} className="border-gray-600" />
          <span className="text-xs text-gray-400">TBD / Requires Investigation</span>
        </div>
        {!budgetTbd && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">$</span>
            <Input
              type="number"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              placeholder="Min"
              className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs"
            />
            <span className="text-xs text-gray-500">–</span>
            <Input
              type="number"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              placeholder="Max"
              className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs"
            />
          </div>
        )}
        <Input
          value={budgetNote}
          onChange={(e) => setBudgetNote(e.target.value)}
          placeholder="Client-facing budget note (optional)..."
          className="h-8 bg-gray-800 border-gray-700 text-white text-xs"
        />
      </div>

      {/* Images */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="cursor-pointer">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-[11px] text-gray-300 transition-colors">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Images
          </div>
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
        </label>
        {images.map((url, idx) => (
          <div key={idx} className="relative w-10 h-10 rounded border border-gray-700 overflow-hidden group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
              className="absolute top-0 right-0 bg-red-600 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={!title.trim() || !categoryId || !groupId || saving} className="bg-red-600 hover:bg-red-700 text-white gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {isEdit ? 'Save' : 'Add Item'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-gray-400">
          <X className="w-3 h-3 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}