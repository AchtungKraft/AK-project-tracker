import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Plus } from "lucide-react";
import { toast } from "sonner";
import KnowledgeBlockEditor from "./KnowledgeBlockEditor";

const TYPES = [
  { value: "procedure", label: "Procedure" },
  { value: "guide", label: "Guide" },
  { value: "issue", label: "Known Issue" },
  { value: "reference", label: "Reference" },
  { value: "checklist", label: "Checklist" },
  { value: "tip", label: "Tip" },
  { value: "document", label: "Document" },
];

export default function KnowledgeItemEditor({ item, isOpen, onClose, categories }) {
  const queryClient = useQueryClient();
  const isNew = !item?.id;

  const [form, setForm] = useState({
    title: "",
    type: "procedure",
    category_id: "",
    subcategory_id: "",
    vehicle_tags: [],
    summary: "",
    content_blocks: [],
    known_issues: [],
    tips: [],
    warnings: [],
    status: "draft",
  });

  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (item) {
      setForm({
        title: item.title || "",
        type: item.type || "procedure",
        category_id: item.category_id || "",
        subcategory_id: item.subcategory_id || "",
        vehicle_tags: item.vehicle_tags || [],
        summary: item.summary || "",
        content_blocks: item.content_blocks || [],
        known_issues: item.known_issues || [],
        tips: item.tips || [],
        warnings: item.warnings || [],
        status: item.status || "draft",
      });
    } else {
      setForm({
        title: "",
        type: "procedure",
        category_id: "",
        subcategory_id: "",
        vehicle_tags: [],
        summary: "",
        content_blocks: [],
        known_issues: [],
        tips: [],
        warnings: [],
        status: "draft",
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
        // Bump version on significant edit
        const newVersion = (item.version || 1) + 1;
        const changelog = [...(item.changelog || []), {
          version: newVersion,
          date: new Date().toISOString(),
          notes: "Updated",
        }];
        return base44.entities.BuildKnowledgeItem.update(item.id, { ...data, version: newVersion, changelog });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
      toast.success(isNew ? 'Item created' : 'Item updated');
      onClose();
    },
  });

  const handleSave = () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-gray-900 text-white w-full sm:max-w-2xl overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-white">{isNew ? 'New Knowledge Item' : `Edit: ${item?.title}`}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pt-2 pb-4">
          {/* Title */}
          <div>
            <Label className="text-gray-400">Title</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Window Frame Restoration Procedure"
              className="bg-gray-800 border-gray-700 text-white" />
          </div>

          {/* Type & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400">Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category / Subcategory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400">Category</Label>
              <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v, subcategory_id: "" }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
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
              <Label className="text-gray-400">Subcategory</Label>
              <Select value={form.subcategory_id} onValueChange={v => setForm(f => ({ ...f, subcategory_id: v }))} disabled={subcategories.length === 0}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder={subcategories.length === 0 ? "Select category first" : "Select subcategory"} />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vehicle Tags */}
          <div>
            <Label className="text-gray-400">Vehicle Tags</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {form.vehicle_tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs border-gray-600 text-gray-300 gap-1">
                  {tag}
                  <button onClick={() => setForm(f => ({ ...f, vehicle_tags: f.vehicle_tags.filter(t => t !== tag) }))}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={e => setTagInput(e.target.value)}
                placeholder="e.g. E9, 911, 356"
                className="bg-gray-800 border-gray-700 text-white"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              />
              <Button size="sm" variant="outline" onClick={addTag} className="border-gray-700 shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div>
            <Label className="text-gray-400">Summary</Label>
            <Textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Brief description for search results and list views"
              className="bg-gray-800 border-gray-700 text-white min-h-[60px]" />
          </div>

          {/* Content Blocks */}
          <div>
            <Label className="text-gray-400">Content</Label>
            <KnowledgeBlockEditor 
              blocks={form.content_blocks} 
              onChange={blocks => setForm(f => ({ ...f, content_blocks: blocks }))} 
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-red-900/30 p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700">Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 bg-red-600 hover:bg-red-700">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isNew ? 'Create' : 'Save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}