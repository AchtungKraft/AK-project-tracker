import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Printer, Save, Settings2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useIsAdmin } from "@/lib/clientAccounts";
import { toPrintLabel, pendingChanges, markSaved } from "./labelDrafts";
import { printToteLabels, paginate } from "./toteLabelDocument";
import { saveLabelSettings } from "./useStorageCategories";
import { useQueryClient } from "@tanstack/react-query";
import ToteLabelEditorRow from "./ToteLabelEditorRow";
import ToteLabelPreview from "./ToteLabelPreview";
import CategorySelect from "./CategorySelect";
import StorageCategoryManager from "./StorageCategoryManager";

/** Shared configuration + preview + print for single and batch tote labels. */
export default function ToteLabelStudio({ drafts, onChange, categories, onThermal }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const [format, setFormat] = useState('letter');
  const [saving, setSaving] = useState(false);
  const [manage, setManage] = useState(false);
  const labels = useMemo(() => drafts.map(d => toPrintLabel(d, categories)), [drafts, categories]);
  const pending = pendingChanges(drafts);
  const printable = drafts.every(d => d.qr_code_value && d.short_code);
  const pages = paginate(labels).length;

  const update = (key, patch) => onChange(drafts.map(d => (d.key === key ? { ...d, ...patch } : d)));
  const print = () => {
    try {
      if (format === 'thermal') return onThermal();
      if (!printToteLabels(labels)) toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print labels.', variant: 'destructive' });
    } catch (e) { toast({ title: 'Cannot print', description: e.message, variant: 'destructive' }); }
  };
  const save = async () => {
    if (pending.some(p => p.name === '')) return toast({ title: 'Container names cannot be blank', variant: 'destructive' });
    setSaving(true);
    try {
      const saved = await saveLabelSettings(pending);
      onChange(markSaved(drafts, saved));
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      toast({ title: `Saved ${saved.length} container${saved.length === 1 ? '' : 's'}` });
    } catch (e) { toast({ title: 'Save failed', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {drafts.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 shrink-0">Apply category to all</span>
          <CategorySelect categories={categories} value={undefined} placeholder="Choose…" className="max-w-[14rem]"
            onChange={id => onChange(drafts.map(d => ({ ...d, category_id: id })))} />
        </div>
      )}
      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {drafts.map(d => <ToteLabelEditorRow key={d.key} draft={d} categories={categories} onChange={p => update(d.key, p)} />)}
      </div>
      {isAdmin && (
        <button type="button" onClick={() => setManage(m => !m)} className="text-xs text-indigo-300 flex items-center gap-1">
          <Settings2 className="w-3.5 h-3.5" /> {manage ? 'Hide' : 'Manage'} storage categories
        </button>
      )}
      {manage && <StorageCategoryManager categories={categories} />}
      {onThermal && (
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="h-9 bg-gray-950 border-gray-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="letter">US Letter: 8 × 3 in color labels, 2 per page</SelectItem>
            <SelectItem value="thermal">4 × 3 in thermal (existing black-and-white format)</SelectItem>
          </SelectContent>
        </Select>
      )}
      {format === 'letter' && <ToteLabelPreview labels={labels} />}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={print} disabled={!printable} className="flex-1 gap-2">
          <Printer className="w-4 h-4" /> Print {drafts.length} label{drafts.length === 1 ? '' : 's'}{format === 'letter' ? ` (${pages} page${pages === 1 ? '' : 's'})` : ''}
        </Button>
        {pending.length > 0 && (
          <Button variant="outline" onClick={save} disabled={saving} className="flex-1 gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save name/category to {pending.length} container{pending.length === 1 ? '' : 's'}
          </Button>
        )}
      </div>
    </div>
  );
}