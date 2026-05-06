import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Package, Camera } from "lucide-react";
import { toast } from "sonner";
import ReactQuill from "react-quill";
import { ENTRY_TYPE_CONFIG } from "./ProcedureEntryTimeline";

const QUILL_MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

const ENTRY_TYPES = [
  { value: "step", label: "Procedure Step" },
  { value: "note", label: "Observation / Note" },
  { value: "issue", label: "Known Issue" },
  { value: "reference", label: "Reference" },
  { value: "tip", label: "Tip / Trick" },
  { value: "media", label: "Photos Only" },
];

const LIFECYCLE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pinned", label: "Pinned — stays prominent" },
  { value: "critical", label: "Critical — warning-level" },
  { value: "archived", label: "Archived — hidden in exec mode" },
];

export default function ProcedureEntryEditor({ procedureId, procedureTitle, existingEntryCount, isOpen, onClose, initialEntryType = "step" }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    headline: "",
    entry_type: initialEntryType,
    content_html: "",
    image_urls: [],
    reference_url: "",
    lifecycle_state: "active",
    part_ids: [],
  });
  const [uploading, setUploading] = useState(false);

  // Reset entry_type when initialEntryType changes (quick-add buttons)
  useEffect(() => {
    if (isOpen) {
      setForm(f => ({ ...f, entry_type: initialEntryType }));
    }
  }, [initialEntryType, isOpen]);

  // Parts for linking
  const { data: allParts = [] } = useQuery({
    queryKey: ['parts_for_entry_editor'],
    queryFn: () => base44.entities.Part.list(),
    staleTime: 120000,
    enabled: isOpen,
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
      setForm({ headline: "", entry_type: "step", content_html: "", image_urls: [], reference_url: "", lifecycle_state: "active", part_ids: [] });
      setPartSearch("");
      onClose();
    },
  });

  const handleSave = () => {
    if (!form.headline.trim()) { toast.error("Headline is required"); return; }
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
    ? allParts.filter(p => (p.part_name || p.name || '').toLowerCase().includes(partSearch.toLowerCase())).slice(0, 8)
    : [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-xl overflow-y-auto flex flex-col p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetDescription className="sr-only">Add entry to procedure</SheetDescription>
          <SheetTitle className="text-white text-base flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${entryConfig.rail}`} />
            ADD {ENTRY_TYPES.find(t => t.value === form.entry_type)?.label?.toUpperCase() || 'ENTRY'}
          </SheetTitle>
          <p className="text-[11px] text-gray-500 truncate">→ {procedureTitle}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
          {/* Entry Type — pill selector */}
          <div className="flex flex-wrap gap-1.5">
            {ENTRY_TYPES.map(t => {
              const tc = ENTRY_TYPE_CONFIG[t.value] || ENTRY_TYPE_CONFIG.step;
              const TIcon = tc.icon;
              const isSelected = form.entry_type === t.value;
              return (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, entry_type: t.value }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${isSelected ? `${tc.rail} text-white` : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
                  <TIcon className="w-3 h-3" /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Headline */}
          <div>
            <Label className="text-gray-400 text-xs">Headline</Label>
            <Input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
              placeholder={form.entry_type === 'step' ? 'e.g. "Remove lower vent frame trim"' : 'Brief description...'}
              className="bg-gray-800 border-gray-700 text-white text-base font-medium" autoFocus />
          </div>

          {/* Content — optional for media type */}
          {form.entry_type !== 'media' && (
            <div>
              <Label className="text-gray-400 text-xs">Details (optional)</Label>
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden [&_.ql-toolbar]:bg-gray-800 [&_.ql-toolbar]:border-gray-700 [&_.ql-container]:border-gray-700 [&_.ql-editor]:text-gray-200 [&_.ql-editor]:min-h-[100px] [&_.ql-snow_.ql-stroke]:stroke-gray-400 [&_.ql-snow_.ql-fill]:fill-gray-400 [&_.ql-snow_.ql-picker-label]:text-gray-400 [&_.ql-snow_.ql-picker-options]:bg-gray-800 [&_.ql-snow_.ql-picker-options]:border-gray-700 [&_.ql-snow_.ql-picker-item]:text-gray-300">
                <ReactQuill theme="snow" value={form.content_html}
                  onChange={val => setForm(f => ({ ...f, content_html: val }))}
                  modules={QUILL_MODULES} placeholder="Write details..." />
              </div>
            </div>
          )}

          {/* Photos — camera-first */}
          <div>
            <Label className="text-gray-400 text-xs">Photos</Label>
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
            <div>
              <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}
                disabled={uploading} className="border-gray-700 gap-2 text-gray-300 h-10 px-4">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Add Photos'}
              </Button>
            </div>
          </div>

          {/* Part links */}
          <div>
            <Label className="text-gray-400 text-xs">Related Parts (optional)</Label>
            {form.part_ids.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.part_ids.map(pid => {
                  const p = allParts.find(pp => pp.id === pid);
                  return (
                    <Badge key={pid} className="bg-gray-800 text-gray-300 text-xs gap-1 border-0 cursor-pointer hover:bg-gray-700"
                      onClick={() => togglePart(pid)}>
                      <Package className="w-3 h-3" /> {p?.part_name || p?.name || pid}
                      <X className="w-2.5 h-2.5 ml-0.5" />
                    </Badge>
                  );
                })}
              </div>
            )}
            <Input value={partSearch} onChange={e => setPartSearch(e.target.value)}
              placeholder="Search parts to link..." className="bg-gray-800 border-gray-700 text-white text-sm h-9" />
            {filteredParts.length > 0 && (
              <div className="mt-1 bg-gray-800 border border-gray-700 rounded-lg max-h-32 overflow-y-auto">
                {filteredParts.map(p => (
                  <button key={p.id} onClick={() => { togglePart(p.id); setPartSearch(""); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 flex items-center gap-2 ${form.part_ids.includes(p.id) ? 'text-red-400' : 'text-gray-300'}`}>
                    <Package className="w-3 h-3 shrink-0" /> {p.part_name || p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reference URL */}
          {(form.entry_type === 'reference' || form.reference_url) && (
            <div>
              <Label className="text-gray-400 text-xs">Reference URL</Label>
              <Input value={form.reference_url} onChange={e => setForm(f => ({ ...f, reference_url: e.target.value }))}
                placeholder="https://..." className="bg-gray-800 border-gray-700 text-white" />
            </div>
          )}

          {/* Lifecycle state */}
          <div>
            <Label className="text-gray-400 text-xs">Lifecycle</Label>
            <Select value={form.lifecycle_state} onValueChange={v => setForm(f => ({ ...f, lifecycle_state: v }))}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIFECYCLE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-gray-900 border-t border-gray-800 p-3 flex gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-700 h-10 flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-red-600 hover:bg-red-700 h-10 flex-1 gap-2">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Add Entry
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}