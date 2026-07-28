import React, { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, X, Plus, Image as ImageIcon, Crown, ChevronDown, ChevronRight, Camera } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import RelatedPostSuggestions from "./RelatedPostSuggestions";
import { FORMAT_OPTIONS, KNOWLEDGE_QUERY_KEYS } from "./knowledgeHelpers";

export default function KnowledgeItemEditor({ item, isOpen, onClose, categories }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isNew = !item?.id;
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
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showMore, setShowMore] = useState(false);

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
      // When editing, expand "More" if there's data in advanced fields
      setShowMore(!!(item.reference_url || item.is_obsolete || item.parent_procedure_id || item.is_pinned));
    } else {
      setForm({
        title: "", category_id: "", subcategory_id: "",
        post_type: "procedure", vehicle_tags: [], summary: "",
        content_html: "", image_urls: [], reference_url: "",
        status: "draft", is_pinned: false, is_master_procedure: false,
        parent_procedure_id: "", cover_image_url: "",
        is_obsolete: false, superseded_by_id: "",
      });
      setShowMore(false);
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
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEYS.articles });
      queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItem'] });
      toast({ title: isNew ? 'Article created' : 'Article updated' });
      onClose();
    },
  });

  const handleSave = () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    saveMutation.mutate({ ...form, slug, type: form.post_type });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.vehicle_tags.includes(tag)) {
      setForm(f => ({ ...f, vehicle_tags: [...f.vehicle_tags, tag] }));
    }
    setTagInput("");
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-950 text-white w-full sm:max-w-lg overflow-y-auto flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-1">
          <SheetDescription className="sr-only">Create or update a knowledge article</SheetDescription>
          <SheetTitle className="text-white text-base">
            {isNew ? 'New Article' : 'Edit Article'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
          {/* === CORE FIELDS — always visible === */}

          {/* Title */}
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder='e.g. "Vent Window Lower Rivet Corrosion"'
            className="bg-gray-900 border-gray-800 text-white text-base h-12" autoFocus />

          {/* Cover Photo */}
          <div>
            {form.cover_image_url ? (
              <div className="relative group">
                <img src={form.cover_image_url} alt="" className="rounded-lg h-32 w-full object-cover bg-gray-900" />
                <button onClick={() => setForm(f => ({ ...f, cover_image_url: "" }))}
                  className="absolute top-2 right-2 bg-black/70 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <>
                <input ref={coverInputRef} type="file" accept="image/*" capture="environment" onChange={handleCoverUpload} className="hidden" />
                <button onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-gray-900 border border-dashed border-gray-800 text-gray-500 active:bg-gray-800 transition-colors">
                  {uploadingCover ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  <span className="text-sm">{uploadingCover ? 'Uploading...' : 'Cover Photo'}</span>
                </button>
              </>
            )}
          </div>

          {/* Subsystem */}
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v, subcategory_id: "" }))}>
              <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-10 text-sm"><SelectValue placeholder="Subsystem" /></SelectTrigger>
              <SelectContent>
                {parentCategories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={form.subcategory_id} onValueChange={v => setForm(f => ({ ...f, subcategory_id: v }))} disabled={subcategories.length === 0}>
              <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-10 text-sm"><SelectValue placeholder={subcategories.length === 0 ? "—" : "Area"} /></SelectTrigger>
              <SelectContent>
                {subcategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle Tags */}
          <div className="flex gap-1.5">
            <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
              placeholder="Vehicle tag (e.g. E9)"
              className="bg-gray-900 border-gray-800 text-white text-sm h-9"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
            <Button size="icon" variant="outline" onClick={addTag} className="border-gray-800 shrink-0 h-9 w-9 bg-gray-900">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {form.vehicle_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 -mt-1">
              {form.vehicle_tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs">
                  {tag}
                  <button onClick={() => setForm(f => ({ ...f, vehicle_tags: f.vehicle_tags.filter(t => t !== tag) }))}>
                    <X className="w-2.5 h-2.5 text-gray-500" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Summary */}
          <Textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
            placeholder="Brief description for listings"
            rows={2}
            className="bg-gray-900 border-gray-800 text-white resize-none text-sm" />

          {/* Format */}
          <div>
            <label className="text-[11px] text-gray-600 mb-1 block">Format</label>
            <div className="flex gap-1.5 flex-wrap">
              {FORMAT_OPTIONS.map(f => (
                <button key={f.value} onClick={() => setForm(prev => ({ ...prev, post_type: f.value }))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors ${form.post_type === f.value ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Master Article + Status */}
          <div className="flex items-center gap-3 py-1">
            <button onClick={() => setForm(f => ({ ...f, is_master_procedure: !f.is_master_procedure, parent_procedure_id: !f.is_master_procedure ? "" : f.parent_procedure_id }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${form.is_master_procedure ? 'bg-red-900/40 text-red-300' : 'bg-gray-900 text-gray-500'}`}>
              <Crown className="w-3 h-3" /> Master Article
            </button>
            <div className="flex gap-1 ml-auto">
              {["draft", "published", "archived"].map(s => (
                <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                  className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${form.status === s ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-600 hover:text-gray-400'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* === MORE OPTIONS — collapsed === */}
          <button onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors py-1">
            {showMore ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            More options
          </button>

          {showMore && (
            <div className="space-y-3 pl-2 border-l border-gray-800/50">
              {/* Pinned */}
              <div className="flex items-center gap-2">
                <Switch checked={form.is_pinned} onCheckedChange={v => setForm(f => ({ ...f, is_pinned: v }))} />
                <span className="text-xs text-gray-400">Pin to top</span>
              </div>

              {/* Parent Procedure */}
              {!form.is_master_procedure && masterProcedures.length > 0 && (
                <div>
                  <label className="text-[11px] text-gray-600 mb-1 block">Attach to procedure</label>
                  <Select value={form.parent_procedure_id} onValueChange={v => setForm(f => ({ ...f, parent_procedure_id: v }))}>
                    <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-9 text-sm">
                      <SelectValue placeholder="None — standalone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>None — standalone</SelectItem>
                      {masterProcedures.map(mp => (
                        <SelectItem key={mp.id} value={mp.id}>{mp.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Reference URL */}
              <div>
                <label className="text-[11px] text-gray-600 mb-1 block">Reference URL</label>
                <Input value={form.reference_url} onChange={e => setForm(f => ({ ...f, reference_url: e.target.value }))}
                  placeholder="https://..." className="bg-gray-900 border-gray-800 text-white text-sm h-8" />
              </div>

              {/* Obsolete */}
              <div className="flex items-center gap-2">
                <Switch checked={form.is_obsolete} onCheckedChange={v => setForm(f => ({ ...f, is_obsolete: v }))} />
                <span className="text-xs text-gray-400">Mark as obsolete</span>
              </div>
              {form.is_obsolete && allItems.length > 0 && (
                <div>
                  <label className="text-[11px] text-gray-600 mb-1 block">Replaced by</label>
                  <Select value={form.superseded_by_id} onValueChange={v => setForm(f => ({ ...f, superseded_by_id: v }))}>
                    <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-9 text-sm">
                      <SelectValue placeholder="Select replacement..." />
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
          )}

          {/* Duplicate prevention */}
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

        {/* Footer */}
        <div className="shrink-0 bg-gray-950 border-t border-gray-800/40 px-4 py-3 flex gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button variant="ghost" onClick={onClose} className="text-gray-500 h-11 px-3">Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700 h-11 text-sm font-medium">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isNew ? 'Create Article' : 'Save Changes')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}