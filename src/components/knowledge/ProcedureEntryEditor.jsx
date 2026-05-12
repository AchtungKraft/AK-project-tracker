import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Package, Camera, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import ReactQuill from "react-quill";
import { ENTRY_TYPE_CONFIG } from "./ProcedureEntryTimeline";

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

// Simplified to 4 types — reduces cognitive load during work
const ENTRY_TYPES = [
  { value: "step", label: "Step" },
  { value: "note", label: "Note" },
  { value: "issue", label: "Warning" },
  { value: "media", label: "Photos" },
];

export default function ProcedureEntryEditor({ procedureId, procedureTitle, existingEntryCount, isOpen, onClose, initialEntryType = "step" }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Map legacy types to simplified set
  const mapEntryType = (type) => {
    if (type === 'tip' || type === 'reference') return 'note';
    return type;
  };

  const [form, setForm] = useState({
    headline: "",
    entry_type: mapEntryType(initialEntryType),
    content_html: "",
    image_urls: [],
    reference_url: "",
    lifecycle_state: "active",
    part_ids: [],
    group_label: "",
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(f => ({ ...f, entry_type: mapEntryType(initialEntryType) }));
      setShowAdvanced(false);
    }
  }, [initialEntryType, isOpen]);

  const { data: allParts = [] } = useQuery({
    queryKey: ['parts_for_entry_editor'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 120000,
    enabled: isOpen && showAdvanced,
  });
  const [partSearch, setPartSearch] = useState("");

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.ProcedureEntry.create({
      ...data,
      procedure_id: procedureId,
      order_index: existingEntryCount || 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedureEntries', procedureId] });
      toast.success('Entry added');
      setForm({ headline: "", entry_type: "step", content_html: "", image_urls: [], reference_url: "", lifecycle_state: "active", part_ids: [], group_label: "" });
      setPartSearch("");
      setShowAdvanced(false);
      onClose();
    },
  });

  const handleSave = () => {
    if (!form.headline.trim()) { toast.error("Headline required"); return; }
    saveMutation.mutate(form);
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

  const togglePart = (partId) => {
    setForm(f => ({
      ...f,
      part_ids: f.part_ids.includes(partId) ? f.part_ids.filter(id => id !== partId) : [...f.part_ids, partId],
    }));
  };

  const entryConfig = ENTRY_TYPE_CONFIG[form.entry_type] || ENTRY_TYPE_CONFIG.step;
  const filteredParts = partSearch
    ? allParts.filter(p => (p.part_name || p.name || '').toLowerCase().includes(partSearch.toLowerCase())).slice(0, 6)
    : [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-950 text-white w-full sm:max-w-lg overflow-y-auto flex flex-col p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Add Entry</SheetTitle>
          <SheetDescription>Add entry to procedure</SheetDescription>
        </SheetHeader>

        {/* Tight header */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs text-gray-500 truncate mb-1">→ {procedureTitle}</p>
          <div className="flex gap-1.5">
            {ENTRY_TYPES.map(t => {
              const tc = ENTRY_TYPE_CONFIG[t.value] || ENTRY_TYPE_CONFIG.step;
              const isSelected = form.entry_type === t.value;
              return (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, entry_type: t.value }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${isSelected ? `${tc.rail} text-white` : 'bg-gray-800/60 text-gray-400 active:bg-gray-700'}`}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Core fields — minimal */}
        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
          {/* Headline */}
          <Input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
            placeholder={form.entry_type === 'step' ? 'What\'s this step?' : form.entry_type === 'issue' ? 'What\'s the warning?' : 'Quick description...'}
            className="bg-gray-900 border-gray-800 text-white text-base h-12" autoFocus />

          {/* Photos — always visible, camera-first */}
          <div>
            {form.image_urls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                {form.image_urls.map((url, i) => (
                  <div key={i} className="relative shrink-0">
                    <img src={url} alt="" className="rounded-lg h-20 w-24 object-cover bg-gray-800" />
                    <button onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 bg-gray-900 rounded-full p-0.5 border border-gray-700">
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" multiple accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-gray-900 border border-dashed border-gray-700 text-gray-400 active:bg-gray-800 transition-colors">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              <span className="text-sm">{uploading ? 'Uploading...' : 'Add Photos'}</span>
            </button>
          </div>

          {/* Notes — optional for photos type, compact */}
          {form.entry_type !== 'media' && (
            <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden [&_.ql-toolbar]:bg-gray-900 [&_.ql-toolbar]:border-gray-800 [&_.ql-toolbar]:py-1 [&_.ql-container]:border-gray-800 [&_.ql-editor]:text-gray-200 [&_.ql-editor]:min-h-[60px] [&_.ql-editor]:text-sm [&_.ql-snow_.ql-stroke]:stroke-gray-500 [&_.ql-snow_.ql-fill]:fill-gray-500 [&_.ql-snow_.ql-picker-label]:text-gray-500 [&_.ql-snow_.ql-picker-options]:bg-gray-900 [&_.ql-snow_.ql-picker-options]:border-gray-800 [&_.ql-snow_.ql-picker-item]:text-gray-400 [&_.ql-editor.ql-blank::before]:text-gray-600">
              <ReactQuill theme="snow" value={form.content_html}
                onChange={val => setForm(f => ({ ...f, content_html: val }))}
                modules={QUILL_MODULES} placeholder="Details (optional)..." />
            </div>
          )}

          {/* Advanced options — collapsed by default */}
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors py-1">
            {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            More options
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l border-gray-800/60">
              {/* Phase group */}
              {form.entry_type === 'step' && (
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">Phase</label>
                  <Input value={form.group_label || ''} onChange={e => setForm(f => ({ ...f, group_label: e.target.value }))}
                    placeholder="e.g. Removal, Installation, Testing"
                    className="bg-gray-900 border-gray-800 text-white text-sm h-9" />
                </div>
              )}

              {/* Parts */}
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Related Parts</label>
                {form.part_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {form.part_ids.map(pid => {
                      const p = allParts.find(pp => pp.id === pid);
                      return (
                        <Badge key={pid} className="bg-gray-800 text-gray-300 text-[11px] gap-0.5 border-0 cursor-pointer hover:bg-gray-700 h-5"
                          onClick={() => togglePart(pid)}>
                          {p?.part_name || p?.name || pid} <X className="w-2.5 h-2.5" />
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <Input value={partSearch} onChange={e => setPartSearch(e.target.value)}
                  placeholder="Search parts..." className="bg-gray-900 border-gray-800 text-white text-sm h-8" />
                {filteredParts.length > 0 && (
                  <div className="mt-1 bg-gray-900 border border-gray-800 rounded-lg max-h-28 overflow-y-auto">
                    {filteredParts.map(p => (
                      <button key={p.id} onClick={() => { togglePart(p.id); setPartSearch(""); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-800 text-gray-300 flex items-center gap-1.5">
                        <Package className="w-3 h-3 shrink-0 text-gray-500" /> {p.part_name || p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Reference URL */}
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Reference URL</label>
                <Input value={form.reference_url} onChange={e => setForm(f => ({ ...f, reference_url: e.target.value }))}
                  placeholder="https://..." className="bg-gray-900 border-gray-800 text-white text-sm h-8" />
              </div>

              {/* Lifecycle */}
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Priority</label>
                <div className="flex gap-1.5">
                  {[
                    { value: "active", label: "Normal" },
                    { value: "pinned", label: "Pinned" },
                    { value: "critical", label: "Critical" },
                    { value: "archived", label: "Archived" },
                  ].map(o => (
                    <button key={o.value} onClick={() => setForm(f => ({ ...f, lifecycle_state: o.value }))}
                      className={`px-2.5 py-1 rounded text-xs transition-colors ${form.lifecycle_state === o.value ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Minimal footer */}
        <div className="shrink-0 bg-gray-950 border-t border-gray-800/60 px-4 py-3 flex gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button variant="ghost" onClick={onClose} className="text-gray-500 h-11 px-3">Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700 h-11 text-sm font-medium">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}