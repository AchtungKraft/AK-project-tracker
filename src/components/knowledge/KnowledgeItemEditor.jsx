import React, { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, X, Plus, Upload, Image as ImageIcon, Pin, Crown, AlertOctagon } from "lucide-react";
import { toast } from "sonner";
import ReactQuill from "react-quill";
import RelatedPostSuggestions from "./RelatedPostSuggestions";

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

const POST_TYPES = [
  { value: "procedure", label: "Procedure" },
  { value: "observation", label: "Observation" },
  { value: "known_issue", label: "Known Issue" },
  { value: "reference", label: "Reference" },
  { value: "tip", label: "Tip" },
];

export default function KnowledgeItemEditor({ item, isOpen, onClose, categories }) {
  const queryClient = useQueryClient();
  const isNew = !item?.id;
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const [form, setForm] = useState({
    title: "", category_id: "", subcategory_id: "",
    post_type: "procedure", vehicle_tags: [], summary: "",
    content_html: "", image_urls: [], reference_url: "",
    status: "draft", is_pinned: false, is_master_procedure: false,
    parent_procedure_id: "", cover_image_url: "",
    is_obsolete: false, superseded_by_id: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Fetch master procedures for linking
  const { data: allItems = [] } = useQuery({
    queryKey: ['buildKnowledgeItems'],
    queryFn: () => base44.entities.BuildKnowledgeItem.list('-updated_date'),
    staleTime: 30000,
  });
  const masterProcedures = useMemo(() =>
    allItems.filter(i => i.is_master_procedure && i.id !== item?.id),
    [allItems, item?.id]
  );

  useEffect(() => {
    if (item) {
      setForm({
        title: item.title || "",
        category_id: item.category_id || "",
        subcategory_id: item.subcategory_id || "",
        post_type: item.post_type || item.type || "procedure",
        vehicle_tags: item.vehicle_tags || [],
        summary: item.summary || "",
        content_html: item.content_html || "",
        image_urls: item.image_urls || [],
        reference_url: item.reference_url || "",
        status: item.status || "draft",
        is_pinned: item.is_pinned || false,
        is_master_procedure: item.is_master_procedure || false,
        parent_procedure_id: item.parent_procedure_id || "",
        cover_image_url: item.cover_image_url || "",
        is_obsolete: item.is_obsolete || false,
        superseded_by_id: item.superseded_by_id || "",
      });
    } else {
      setForm({
        title: "", category_id: "", subcategory_id: "",
        post_type: "procedure", vehicle_tags: [], summary: "",
        content_html: "", image_urls: [], reference_url: "",
        status: "draft", is_pinned: false, is_master_procedure: false,
        parent_procedure_id: "", cover_image_url: "",
        is_obsolete: false, superseded_by_id: "",
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
      toast.success(isNew ? 'Post created' : 'Post updated');
      onClose();
    },
  });

  const handleSave = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // Sync post_type to legacy type field
    saveMutation.mutate({ ...form, slug, type: form.post_type });
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

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, cover_image_url: file_url }));
    setUploadingCover(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  const removeImage = (index) => {
    setForm(f => ({ ...f, image_urls: f.image_urls.filter((_, i) => i !== index) }));
  };

  const postTypeLabel = isNew ? 'Create Procedure' : 'Save Changes';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetDescription className="sr-only">Create or update a knowledge post</SheetDescription>
          <SheetTitle className="text-white text-lg">
            {isNew ? 'NEW PROCEDURE' : `EDIT: ${item?.title}`}
          </SheetTitle>
          <p className="text-xs text-gray-400 mt-0.5">
            {isNew ? 'Create a procedure container — add entries inside it after saving' : 'Edit procedure metadata and settings'}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
          {/* Post Type */}
          <div>
            <Label className="text-gray-400 text-xs">Post Type</Label>
            <Select value={form.post_type} onValueChange={v => setForm(f => ({ ...f, post_type: v }))}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPES.map(pt => (
                  <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <Label className="text-gray-400 text-xs">Headline</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder='e.g. "Vent Window Lower Rivet Corrosion"'
              className="bg-gray-800 border-gray-700 text-white text-lg font-medium" />
          </div>

          {/* Cover Image */}
          <div>
            <Label className="text-gray-400 text-xs">Cover Image</Label>
            {form.cover_image_url ? (
              <div className="relative group mb-2">
                <img src={form.cover_image_url} alt="" className="rounded-lg h-36 w-full object-cover bg-gray-800" />
                <button onClick={() => setForm(f => ({ ...f, cover_image_url: "" }))}
                  className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                <Button variant="outline" size="sm" onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover} className="border-gray-700 gap-2 text-gray-300">
                  {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  {uploadingCover ? 'Uploading...' : 'Set Cover Photo'}
                </Button>
              </div>
            )}
          </div>

          {/* Category / Subcategory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Subsystem</Label>
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
              <Label className="text-gray-400 text-xs">Area</Label>
              <Select value={form.subcategory_id} onValueChange={v => setForm(f => ({ ...f, subcategory_id: v }))} disabled={subcategories.length === 0}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder={subcategories.length === 0 ? "—" : "Select..."} /></SelectTrigger>
                <SelectContent>
                  {subcategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pin / Master / Status row */}
          <div className="flex items-center gap-4 flex-wrap py-1">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_pinned} onCheckedChange={v => setForm(f => ({ ...f, is_pinned: v }))} />
              <Label className="text-gray-300 text-xs flex items-center gap-1"><Pin className="w-3 h-3" /> Pin to Top</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_master_procedure} onCheckedChange={v => setForm(f => ({ ...f, is_master_procedure: v, parent_procedure_id: v ? "" : f.parent_procedure_id }))} />
              <Label className="text-gray-300 text-xs flex items-center gap-1"><Crown className="w-3 h-3" /> Master Procedure</Label>
            </div>
            <div className="ml-auto">
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Parent Master Procedure (only if not a master itself) */}
          {!form.is_master_procedure && masterProcedures.length > 0 && (
            <div>
              <Label className="text-gray-400 text-xs">Attach to Master Procedure (optional)</Label>
              <Select value={form.parent_procedure_id} onValueChange={v => setForm(f => ({ ...f, parent_procedure_id: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None — standalone post" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None — standalone post</SelectItem>
                  {masterProcedures.map(mp => (
                    <SelectItem key={mp.id} value={mp.id}>
                      <span className="flex items-center gap-2">
                        <Crown className="w-3 h-3 text-red-400" />
                        {mp.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Vehicle Tags */}
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
          {form.vehicle_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 -mt-2">
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
            <Label className="text-gray-400 text-xs">Summary (card preview)</Label>
            <Textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Brief one-liner for feed cards"
              rows={2}
              className="bg-gray-800 border-gray-700 text-white resize-none" />
          </div>

          {/* WYSIWYG Content */}
          <div>
            <Label className="text-gray-400 text-xs">Content (supports inline images)</Label>
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden [&_.ql-toolbar]:bg-gray-800 [&_.ql-toolbar]:border-gray-700 [&_.ql-container]:border-gray-700 [&_.ql-editor]:text-gray-200 [&_.ql-editor]:min-h-[200px] [&_.ql-snow_.ql-stroke]:stroke-gray-400 [&_.ql-snow_.ql-fill]:fill-gray-400 [&_.ql-snow_.ql-picker-label]:text-gray-400 [&_.ql-snow_.ql-picker-options]:bg-gray-800 [&_.ql-snow_.ql-picker-options]:border-gray-700 [&_.ql-snow_.ql-picker-item]:text-gray-300">
              <ReactQuill
                theme="snow"
                value={form.content_html}
                onChange={val => setForm(f => ({ ...f, content_html: val }))}
                modules={QUILL_MODULES}
                placeholder="Write procedures, observations, notes... Use the image button in toolbar to embed inline images."
              />
            </div>
          </div>

          {/* Gallery Images */}
          <div>
            <Label className="text-gray-400 text-xs">Gallery Images</Label>
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
                {uploading ? 'Uploading...' : 'Upload Photos'}
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

          {/* Governance: Obsolete / Superseded */}
          <div className="rounded-lg border border-gray-700/50 p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Lifecycle</p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_obsolete} onCheckedChange={v => setForm(f => ({ ...f, is_obsolete: v }))} />
                <Label className="text-gray-300 text-xs flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> Obsolete</Label>
              </div>
            </div>
            {form.is_obsolete && allItems.length > 0 && (
              <div>
                <Label className="text-gray-400 text-xs">Superseded By (optional)</Label>
                <Select value={form.superseded_by_id} onValueChange={v => setForm(f => ({ ...f, superseded_by_id: v }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select replacement post..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>None</SelectItem>
                    {allItems.filter(i => i.id !== item?.id && !i.is_obsolete).map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Related Post Suggestions (duplicate prevention) */}
          {isNew && (
            <RelatedPostSuggestions
              title={form.title}
              categoryId={form.category_id}
              vehicleTags={form.vehicle_tags}
              allItems={allItems}
              currentItemId={item?.id}
            />
          )}
        </div>

        {/* Footer — large touch targets */}
        <div className="shrink-0 bg-gray-900 border-t border-red-900/30 p-4 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700 h-11 text-base">Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700 h-11 text-base">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : postTypeLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}