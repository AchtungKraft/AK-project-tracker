import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Plus, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import ReactQuill from "react-quill";

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    ['blockquote', 'code-block'],
    ['clean'],
  ],
};

export default function KnowledgeItemEditor({ item, isOpen, onClose, categories }) {
  const queryClient = useQueryClient();
  const isNew = !item?.id;
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    title: "", category_id: "", subcategory_id: "",
    vehicle_tags: [], summary: "", content_html: "",
    image_urls: [], reference_url: "", status: "draft",
  });
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (item) {
      setForm({
        title: item.title || "",
        category_id: item.category_id || "",
        subcategory_id: item.subcategory_id || "",
        vehicle_tags: item.vehicle_tags || [],
        summary: item.summary || "",
        content_html: item.content_html || "",
        image_urls: item.image_urls || [],
        reference_url: item.reference_url || "",
        status: item.status || "draft",
      });
    } else {
      setForm({
        title: "", category_id: "", subcategory_id: "",
        vehicle_tags: [], summary: "", content_html: "",
        image_urls: [], reference_url: "", status: "draft",
      });
    }
  }, [item]);

  const parentCategories = categories.filter(c => !c.parent_id && c.active)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const subcategories = form.category_id
    ? categories.filter(c => c.parent_id === form.category_id && c.active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    : [];

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isNew) {
        return base44.entities.BuildKnowledgeItem.create(data);
      } else {
        const newVersion = (item.version || 1) + 1;
        const changelog = [...(item.changelog || []), {
          version: newVersion, date: new Date().toISOString(), notes: "Updated",
        }];
        return base44.entities.BuildKnowledgeItem.update(item.id, { ...data, version: newVersion, changelog });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
      toast.success(isNew ? 'Entry created' : 'Entry updated');
      onClose();
    },
  });

  const handleSave = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    saveMutation.mutate({ ...form, slug });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.vehicle_tags.includes(tag)) {
      setForm(f => ({ ...f, vehicle_tags: [...f.vehicle_tags, tag] }));
    }
    setTagInput("");
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setForm(f => ({ ...f, image_urls: [...f.image_urls, ...urls] }));
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index) => {
    setForm(f => ({ ...f, image_urls: f.image_urls.filter((_, i) => i !== index) }));
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="text-white">{isNew ? 'New Knowledge Entry' : `Edit: ${item?.title}`}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
          {/* Title */}
          <div>
            <Label className="text-gray-400 text-xs">Headline</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder='e.g. "Vent Window Lower Rivet Corrosion"'
              className="bg-gray-800 border-gray-700 text-white text-lg font-medium" />
          </div>

          {/* Category / Subcategory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Category</Label>
              <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v, subcategory_id: "" }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {parentCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Subcategory</Label>
              <Select value={form.subcategory_id} onValueChange={v => setForm(f => ({ ...f, subcategory_id: v }))} disabled={subcategories.length === 0}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder={subcategories.length === 0 ? "—" : "Select..."} /></SelectTrigger>
                <SelectContent>
                  {subcategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status + Vehicle Tags row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Vehicle Tags</Label>
              <div className="flex gap-1.5">
                <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  placeholder="e.g. E9"
                  className="bg-gray-800 border-gray-700 text-white"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
                <Button size="icon" variant="outline" onClick={addTag} className="border-gray-700 shrink-0 h-9 w-9">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          {form.vehicle_tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {form.vehicle_tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs border-gray-600 text-gray-300 gap-1">
                  {tag}
                  <button onClick={() => setForm(f => ({ ...f, vehicle_tags: f.vehicle_tags.filter(t => t !== tag) }))}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Summary */}
          <div>
            <Label className="text-gray-400 text-xs">Summary (for lists)</Label>
            <Input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Brief one-liner for card previews"
              className="bg-gray-800 border-gray-700 text-white" />
          </div>

          {/* WYSIWYG Content */}
          <div>
            <Label className="text-gray-400 text-xs">Content</Label>
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden [&_.ql-toolbar]:bg-gray-800 [&_.ql-toolbar]:border-gray-700 [&_.ql-container]:border-gray-700 [&_.ql-editor]:text-gray-200 [&_.ql-editor]:min-h-[200px] [&_.ql-snow_.ql-stroke]:stroke-gray-400 [&_.ql-snow_.ql-fill]:fill-gray-400 [&_.ql-snow_.ql-picker-label]:text-gray-400 [&_.ql-snow_.ql-picker-options]:bg-gray-800 [&_.ql-snow_.ql-picker-options]:border-gray-700 [&_.ql-snow_.ql-picker-item]:text-gray-300">
              <ReactQuill
                theme="snow"
                value={form.content_html}
                onChange={val => setForm(f => ({ ...f, content_html: val }))}
                modules={QUILL_MODULES}
                placeholder="Write operational notes, procedures, observations..."
              />
            </div>
          </div>

          {/* Image Uploads */}
          <div>
            <Label className="text-gray-400 text-xs">Images</Label>
            {form.image_urls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {form.image_urls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="rounded-lg h-24 w-full object-cover bg-gray-800" />
                    <button onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 bg-black/70 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}
                disabled={uploading} className="border-gray-700 gap-2 text-gray-300">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Upload Images'}
              </Button>
            </div>
          </div>

          {/* Reference URL */}
          <div>
            <Label className="text-gray-400 text-xs">Reference URL (optional)</Label>
            <Input value={form.reference_url} onChange={e => setForm(f => ({ ...f, reference_url: e.target.value }))}
              placeholder="https://... (vendor docs, YouTube, forum, OEM PDF)"
              className="bg-gray-800 border-gray-700 text-white" />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-gray-900 border-t border-red-900/30 p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700">Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isNew ? 'Create Entry' : 'Save Changes')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}