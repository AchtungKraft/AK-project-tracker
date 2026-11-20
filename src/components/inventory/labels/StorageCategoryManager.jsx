import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { STORAGE_CATEGORIES_KEY } from "./useStorageCategories";
import StorageCategoryRow from "./StorageCategoryRow";
import { normalizeHex } from "./labelColors";

/** Admin-only: create, rename and recolor storage label categories. */
export default function StorageCategoryManager({ categories }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: STORAGE_CATEGORIES_KEY });
      toast({ title: ok });
    } catch (e) {
      toast({ title: 'Category not saved', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const save = (cat, patch) => {
    if (patch.name !== undefined && !patch.name.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    if (patch.color !== undefined && !normalizeHex(patch.color)) return toast({ title: 'Use a #RRGGBB color', variant: 'destructive' });
    const clean = { ...patch, ...(patch.color ? { color: normalizeHex(patch.color) } : {}), ...(patch.name ? { name: patch.name.trim() } : {}) };
    run(() => base44.entities.StorageLabelCategory.update(cat.id, clean), 'Category updated');
  };

  const add = () => {
    if (!name.trim()) return;
    const order = Math.max(0, ...categories.map(c => c.sort_order || 0)) + 1;
    run(() => base44.entities.StorageLabelCategory.create({ name: name.trim(), color: '#0d9488', sort_order: order, active: true }), 'Category added')
      .then(() => setName(''));
  };

  return (
    <div className="space-y-2 rounded-md border border-gray-700 p-3">
      <p className="text-sm font-semibold">Storage categories</p>
      <p className="text-xs text-gray-400">Used only to identify totes. Color changes apply to future prints.</p>
      {categories.map(c => <StorageCategoryRow key={c.id} category={c} disabled={busy} onSave={patch => save(c, patch)} />)}
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="New category name" className="h-9 bg-gray-950 border-gray-700" />
        <Button size="sm" onClick={add} disabled={busy || !name.trim()} className="h-9">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
        </Button>
      </div>
    </div>
  );
}