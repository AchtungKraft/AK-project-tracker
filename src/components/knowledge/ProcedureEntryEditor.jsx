import React, { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import ReactQuill from "react-quill";

const QUILL_MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    ['clean'],
  ],
};

const ENTRY_TYPES = [
  { value: "step", label: "Procedure Step" },
  { value: "note", label: "Observation / Note" },
  { value: "issue", label: "Known Issue" },
  { value: "reference", label: "Reference" },
  { value: "tip", label: "Tip / Trick" },
  { value: "media", label: "Media / Photos" },
];

export default function ProcedureEntryEditor({ procedureId, procedureTitle, existingEntryCount, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    headline: "",
    entry_type: "step",
    content_html: "",
    image_urls: [],
    reference_url: "",
  });
  const [uploading, setUploading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.ProcedureEntry.create({
      ...data,
      procedure_id: procedureId,
      order_index: existingEntryCount || 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedureEntries', procedureId] });
      toast.success('Entry added');
      // Reset form
      setForm({ headline: "", entry_type: "step", content_html: "", image_urls: [], reference_url: "" });
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

  const entryLabel = ENTRY_TYPES.find(t => t.value === form.entry_type)?.label || 'Entry';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-xl overflow-y-auto flex flex-col p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetDescription className="sr-only">Add an entry to a procedure</SheetDescription>
          <SheetTitle className="text-white text-lg">
            ADD ENTRY
          </SheetTitle>
          <p className="text-xs text-gray-400 truncate">to: {procedureTitle}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
          {/* Entry Type */}
          <div>
            <Label className="text-gray-400 text-xs">Entry Type</Label>
            <Select value={form.entry_type} onValueChange={v => setForm(f => ({ ...f, entry_type: v }))}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Headline */}
          <div>
            <Label className="text-gray-400 text-xs">Headline</Label>
            <Input value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
              placeholder='e.g. "Relay testing procedure"'
              className="bg-gray-800 border-gray-700 text-white text-base font-medium" />
          </div>

          {/* WYSIWYG */}
          <div>
            <Label className="text-gray-400 text-xs">Content</Label>
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden [&_.ql-toolbar]:bg-gray-800 [&_.ql-toolbar]:border-gray-700 [&_.ql-container]:border-gray-700 [&_.ql-editor]:text-gray-200 [&_.ql-editor]:min-h-[140px] [&_.ql-snow_.ql-stroke]:stroke-gray-400 [&_.ql-snow_.ql-fill]:fill-gray-400 [&_.ql-snow_.ql-picker-label]:text-gray-400 [&_.ql-snow_.ql-picker-options]:bg-gray-800 [&_.ql-snow_.ql-picker-options]:border-gray-700 [&_.ql-snow_.ql-picker-item]:text-gray-300">
              <ReactQuill
                theme="snow"
                value={form.content_html}
                onChange={val => setForm(f => ({ ...f, content_html: val }))}
                modules={QUILL_MODULES}
                placeholder="Write your entry content..."
              />
            </div>
          </div>

          {/* Gallery Images */}
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
              placeholder="https://..."
              className="bg-gray-800 border-gray-700 text-white" />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-gray-900 border-t border-red-900/30 p-4 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700 h-11 text-base">Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700 h-11 text-base">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Add ${entryLabel}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}