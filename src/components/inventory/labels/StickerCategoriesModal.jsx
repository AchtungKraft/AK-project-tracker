import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useStickerCategoryAdmin, useSaveStickerCategory } from "./stickerCategoryApi";
import StickerCategoryForm from "./StickerCategoryForm";
import StickerCategoryTableRow from "./StickerCategoryTableRow";

/** Admin: sticker categories (tote label identification colors). Never deletes; deactivate instead. */
export default function StickerCategoriesModal({ open, onClose }) {
  const { toast } = useToast();
  const { data: categories = [], isLoading, error } = useStickerCategoryAdmin(open);
  const save = useSaveStickerCategory();
  const [editing, setEditing] = useState(null); // null | 'new' | category
  const [busyId, setBusyId] = useState(null);

  const submit = async (cat) => {
    await save(cat);
    toast({ title: cat.id ? 'Category updated' : 'Category added' });
    setEditing(null);
  };
  const toggle = async (c) => {
    setBusyId(c.id);
    try { await save({ id: c.id, name: c.name, color: c.color, active: !c.active }); }
    catch (e) { toast({ title: 'Not saved', description: e.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-gray-950 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle>Sticker Categories</DialogTitle>
          <DialogDescription className="text-gray-400">
            Colors used to identify totes on printed labels. Changes apply to future prints. Inactive categories stay on existing totes but can't be newly assigned. Totes without a category print as General Storage.
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <StickerCategoryForm key={editing.id || 'new'} category={editing === 'new' ? null : editing}
            onSave={submit} onCancel={() => setEditing(null)} />
        ) : (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEditing('new')} className="gap-1.5"><Plus className="w-4 h-4" /> Add Category</Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400">
                <th className="px-2 py-1">Color</th><th className="px-2 py-1">Category Name</th><th className="px-2 py-1">HEX Color</th>
                <th className="px-2 py-1 text-right">Totes Using</th><th className="px-2 py-1">Status</th><th className="px-2 py-1 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {categories.map(c => (
                  <StickerCategoryTableRow key={c.id} category={c} busy={busyId === c.id}
                    onEdit={() => setEditing(c)} onToggle={() => toggle(c)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}