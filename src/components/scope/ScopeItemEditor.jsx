import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, X, Upload, Loader2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import LaborEstimateEditor from "./LaborEstimateEditor";
import { formatDollarRange } from "./scopePricingHelpers";

/**
 * Scope Item editor — used for both creating and editing items.
 * Supports legacy_estimate and hard_cost_plus_labor pricing models.
 */
export default function ScopeItemEditor({
  requestId,
  categories = [],
  groups = [],
  laborGroups = [],
  laborEstimates: initialLaborEstimates = [],
  onSave,
  onCancel,
  editItem = null,
  preselectedCategoryId = null,
  preselectedGroupId = null,
  isMobile = false,
}) {
  const isEdit = !!editItem;
  const existingModel = editItem?.pricing_model || (isEdit ? 'legacy_estimate' : 'hard_cost_plus_labor');
  const hasLegacyBudget = isEdit && existingModel === 'legacy_estimate' && (editItem?.budget_min != null || editItem?.budget_max != null || editItem?.budget_tbd);

  const [title, setTitle] = useState(editItem?.title || "");
  const [description, setDescription] = useState(editItem?.description || "");
  const [categoryId, setCategoryId] = useState(editItem?.category_id || preselectedCategoryId || (categories[0]?.id || ""));
  const [groupId, setGroupId] = useState(editItem?.group_id || preselectedGroupId || (groups[0]?.id || ""));
  // Pricing model state
  const [pricingModel, setPricingModel] = useState(existingModel);
  // Legacy fields
  const [budgetMin, setBudgetMin] = useState(editItem?.budget_min ?? "");
  const [budgetMax, setBudgetMax] = useState(editItem?.budget_max ?? "");
  const [budgetNote, setBudgetNote] = useState(editItem?.budget_note || "");
  const [budgetTbd, setBudgetTbd] = useState(editItem?.budget_tbd || false);
  // Hard cost fields
  const [hardCostMin, setHardCostMin] = useState(editItem?.hard_cost_min ?? "");
  const [hardCostMax, setHardCostMax] = useState(editItem?.hard_cost_max ?? "");
  const [hardCostTbd, setHardCostTbd] = useState(editItem?.hard_cost_tbd || false);
  const [hardCostNote, setHardCostNote] = useState(editItem?.hard_cost_note || editItem?.budget_note || "");

  const [images, setImages] = useState(editItem?.images || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labor, setLabor] = useState(() =>
    initialLaborEstimates.map(le => ({
      labor_group_id: le.labor_group_id,
      labor_group_name_snapshot: le.labor_group_name_snapshot || '',
      hours_min: le.hours_min ?? "",
      hours_max: le.hours_max ?? "",
      rate_snapshot: le.rate_snapshot || 0,
    }))
  );

  const sortedCategories = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const sortedGroups = [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Compute live labor totals
  const laborTotals = useMemo(() => {
    let hMin = 0, hMax = 0, cMin = 0, cMax = 0;
    for (const e of labor) {
      const h1 = Number(e.hours_min) || 0;
      const h2 = Number(e.hours_max) || 0;
      hMin += h1;
      hMax += h2;
      cMin += h1 * (e.rate_snapshot || 0);
      cMax += h2 * (e.rate_snapshot || 0);
    }
    return { hMin, hMax, cMin, cMax };
  }, [labor]);

  // Compute live total estimate
  const totalEstimate = useMemo(() => {
    if (pricingModel !== 'hard_cost_plus_labor') return null;
    const hcMin = Number(hardCostMin) || 0;
    const hcMax = Number(hardCostMax) || 0;
    if (hardCostTbd) return null;
    if (!hcMin && !hcMax && !laborTotals.cMin && !laborTotals.cMax) return null;
    return {
      min: hcMin + laborTotals.cMin,
      max: hcMax + laborTotals.cMax,
      complete: (hcMin > 0 || hcMax > 0) && (laborTotals.cMin > 0 || laborTotals.cMax > 0),
    };
  }, [pricingModel, hardCostMin, hardCostMax, hardCostTbd, laborTotals]);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
    setImages(prev => [...prev, ...results.map(r => r.file_url)]);
    setUploading(false);
    e.target.value = "";
  };

  const handleConvertToHardCost = () => {
    setHardCostMin(budgetMin);
    setHardCostMax(budgetMax);
    setHardCostTbd(budgetTbd);
    setHardCostNote(budgetNote);
    setPricingModel('hard_cost_plus_labor');
  };

  const handleConvertManual = () => {
    // Clear hard cost — user enters fresh values
    setHardCostMin("");
    setHardCostMax("");
    setHardCostTbd(false);
    setHardCostNote(budgetNote);
    setPricingModel('hard_cost_plus_labor');
  };

  const handleSave = async () => {
    if (!title.trim() || !categoryId || !groupId) return;
    setSaving(true);

    const data = {
      request_id: requestId,
      category_id: categoryId,
      group_id: groupId,
      title: title.trim(),
      description: description.trim() || null,
      pricing_model: pricingModel,
      images: images.length > 0 ? images : null,
    };

    if (pricingModel === 'hard_cost_plus_labor') {
      data.hard_cost_min = hardCostTbd ? null : (hardCostMin !== "" ? Number(hardCostMin) : null);
      data.hard_cost_max = hardCostTbd ? null : (hardCostMax !== "" ? Number(hardCostMax) : null);
      data.hard_cost_tbd = hardCostTbd;
      data.hard_cost_note = hardCostNote.trim() || null;
      data.budget_note = hardCostNote.trim() || null; // Keep synced for client display
      // Clear legacy budget fields
      data.budget_min = null;
      data.budget_max = null;
      data.budget_tbd = false;
    } else {
      data.budget_min = budgetTbd ? null : (budgetMin !== "" ? Number(budgetMin) : null);
      data.budget_max = budgetTbd ? null : (budgetMax !== "" ? Number(budgetMax) : null);
      data.budget_note = budgetNote.trim() || null;
      data.budget_tbd = budgetTbd;
    }

    await onSave(data, editItem?.id, labor);
    setSaving(false);
  };

  return (
    <div className="space-y-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
      <h4 className="text-sm font-semibold text-white">{isEdit ? 'Edit Scope Item' : 'Add Scope Item'}</h4>

      <Input value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Item title..." className="bg-gray-800 border-gray-700 text-white" autoFocus />

      <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Description / context..." className="bg-gray-800 border-gray-700 text-white text-sm min-h-[60px] resize-none" />

      {/* Category & Group */}
      <div className={cn("flex gap-2", isMobile ? "flex-col" : "flex-wrap")}>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wide">Category</label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-44 h-8 bg-gray-800 border-gray-700 text-white text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>{sortedCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wide">Group</label>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger className="w-44 h-8 bg-gray-800 border-gray-700 text-white text-xs"><SelectValue placeholder="Select group" /></SelectTrigger>
            <SelectContent>{sortedGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Legacy conversion prompt */}
      {pricingModel === 'legacy_estimate' && hasLegacyBudget && (
        <div className="p-3 bg-amber-950/20 border border-amber-700/30 rounded-lg space-y-2">
          <p className="text-xs text-amber-300 font-medium">Existing Estimate</p>
          <p className="text-sm text-white font-semibold">
            {budgetTbd ? 'TBD' : formatDollarRange(Number(budgetMin) || null, Number(budgetMax) || null)}
          </p>
          <p className="text-[11px] text-amber-400/70">How should this existing estimate be treated?</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleConvertToHardCost} className="bg-amber-700 hover:bg-amber-600 text-white gap-1.5 text-xs">
              <ArrowRight className="w-3 h-3" /> Existing Estimate is Hard Cost
            </Button>
            <Button size="sm" variant="outline" onClick={handleConvertManual} className="border-amber-700 text-amber-300 hover:bg-amber-950/30 gap-1.5 text-xs">
              <ArrowRight className="w-3 h-3" /> Estimate Already Includes Labor
            </Button>
          </div>
        </div>
      )}

      {/* Legacy budget (unclassified or new legacy) */}
      {pricingModel === 'legacy_estimate' && !hasLegacyBudget && (
        <div className="space-y-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-wide">Estimate Range</label>
          <div className="flex items-center gap-2">
            <Checkbox checked={budgetTbd} onCheckedChange={setBudgetTbd} className="border-gray-600" />
            <span className="text-xs text-gray-400">TBD / Requires Investigation</span>
          </div>
          {!budgetTbd && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">$</span>
              <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)}
                placeholder="Min" className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs" />
              <span className="text-xs text-gray-500">–</span>
              <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="Max" className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs" />
            </div>
          )}
          <Input value={budgetNote} onChange={(e) => setBudgetNote(e.target.value)}
            placeholder="Client-facing note (optional)..." className="h-8 bg-gray-800 border-gray-700 text-white text-xs" />
        </div>
      )}

      {/* Hard Cost (classified items) */}
      {pricingModel === 'hard_cost_plus_labor' && (
        <div className="space-y-2 p-3 bg-gray-800/30 border border-gray-700/30 rounded-lg">
          <label className="text-[10px] text-cyan-400 uppercase tracking-wide font-semibold">Hard Cost</label>
          <p className="text-[10px] text-gray-500">Parts, materials, outside services — non-AK-labor cost</p>
          <div className="flex items-center gap-2">
            <Checkbox checked={hardCostTbd} onCheckedChange={setHardCostTbd} className="border-gray-600" />
            <span className="text-xs text-gray-400">TBD / Requires Investigation</span>
          </div>
          {!hardCostTbd && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">$</span>
              <Input type="number" value={hardCostMin} onChange={(e) => setHardCostMin(e.target.value)}
                placeholder="Min" className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs" />
              <span className="text-xs text-gray-500">–</span>
              <Input type="number" value={hardCostMax} onChange={(e) => setHardCostMax(e.target.value)}
                placeholder="Max" className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs" />
            </div>
          )}
          <Input value={hardCostNote} onChange={(e) => setHardCostNote(e.target.value)}
            placeholder="Client-facing cost note (optional)..." className="h-8 bg-gray-800 border-gray-700 text-white text-xs" />
        </div>
      )}

      {/* AK Labor Estimates */}
      <LaborEstimateEditor laborGroups={laborGroups} estimates={labor} onChange={setLabor} isMobile={isMobile} />

      {/* Live Total Estimate */}
      {pricingModel === 'hard_cost_plus_labor' && (
        <div className="p-2 bg-gray-900/60 border border-gray-700/30 rounded-md">
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-gray-500 uppercase font-medium">Total Estimate</span>
            {totalEstimate?.complete ? (
              <span className="text-white font-bold text-sm">{formatDollarRange(totalEstimate.min, totalEstimate.max)}</span>
            ) : hardCostTbd ? (
              <span className="text-gray-400 italic">TBD</span>
            ) : laborTotals.cMin === 0 && laborTotals.cMax === 0 ? (
              <span className="text-gray-400 italic">Pending AK labor</span>
            ) : (
              <span className="text-white font-bold text-sm">{formatDollarRange((Number(hardCostMin) || 0) + laborTotals.cMin, (Number(hardCostMax) || 0) + laborTotals.cMax)}</span>
            )}
          </div>
        </div>
      )}

      {/* Images */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="cursor-pointer">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-[11px] text-gray-300 transition-colors">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Images
          </div>
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
        </label>
        {images.map((url, idx) => (
          <div key={idx} className="relative w-10 h-10 rounded border border-gray-700 overflow-hidden group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
              className="absolute top-0 right-0 bg-red-600 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={!title.trim() || !categoryId || !groupId || saving} className="bg-red-600 hover:bg-red-700 text-white gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {isEdit ? 'Save' : 'Add Item'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-gray-400">
          <X className="w-3 h-3 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}