import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  "Mechanical", "Electrical", "Interior", "Exterior", "HVAC",
  "Engine Management", "Suspension", "Brakes", "Standard Installation", "Other",
];

export default function PartGroupFormModal({ group, onClose }) {
  const isEdit = !!group;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: group?.name || "",
    description: group?.description || "",
    group_code: group?.group_code || "",
    image_url: group?.image_url || "",
    status: group?.status || "DRAFT",
    category: group?.category || "",
    notes: group?.notes || "",
    instructions: group?.instructions || "",
  });

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const data = {
      name: form.name.trim(),
      description: form.description || undefined,
      group_code: form.group_code || undefined,
      image_url: form.image_url || undefined,
      status: form.status,
      category: form.category || undefined,
      notes: form.notes || undefined,
      instructions: form.instructions || undefined,
    };

    if (isEdit) {
      await base44.entities.PartGroup.update(group.id, data);
    } else {
      await base44.entities.PartGroup.create(data);
    }

    queryClient.invalidateQueries({ queryKey: ["partGroups"] });
    toast({ title: isEdit ? "Group updated" : "Group created" });
    setSaving(false);
    onClose();
  };

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setField("image_url", file_url);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Parts Group" : "Create Parts Group"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Air Conditioning System Installation" />
          </div>

          <div>
            <Label>Group Code</Label>
            <Input value={form.group_code} onChange={e => setField("group_code", e.target.value)} placeholder="Optional identifier" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setField("description", e.target.value)} placeholder="What does this group cover?" rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category || "__none__"} onValueChange={v => setField("category", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Image</Label>
            <div className="flex items-center gap-3">
              {form.image_url && (
                <img src={form.image_url} alt="" className="w-16 h-16 rounded object-cover border border-gray-700" />
              )}
              <Input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="Internal notes" rows={2} />
          </div>

          <div>
            <Label>Instructions</Label>
            <Textarea value={form.instructions} onChange={e => setField("instructions", e.target.value)} placeholder="Installation or usage instructions" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700">
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}