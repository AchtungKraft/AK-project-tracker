import React, { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ListChecks } from "lucide-react";
import { buildScopeHierarchy } from "./scopeHelpers";

const isEligible = (i) => i.decision_status === "approved" && !(i.linked_task_ids || []).length;
const isConverted = (i) => i.decision_status === "approved" && (i.linked_task_ids || []).length > 0;

/** CATEGORY → GROUP → approved items, canonical sort_order. Converted items shown read-only. */
export function useBulkScopeTree(items, categories, groups) {
  return useMemo(() => {
    const shown = items.filter(i => isEligible(i) || isConverted(i));
    const tree = buildScopeHierarchy(categories, groups, shown)
      .map(c => ({ id: c.id, name: c.name, groups: c.groups.map(g => ({ id: g.id, name: g.name, items: g.items })) }))
      .filter(c => c.groups.length);
    // Safety net: approved items whose category/group record is missing still appear.
    const placed = new Set(tree.flatMap(c => c.groups.flatMap(g => g.items.map(i => i.id))));
    const orphans = shown.filter(i => !placed.has(i.id));
    if (orphans.length) tree.push({ id: "__other__", name: "Other", groups: [{ id: "__other__", name: "Unassigned group", items: orphans }] });
    return tree;
  }, [items, categories, groups]);
}

function TriCheckbox({ ids, selected, setSelected, label }) {
  const n = ids.filter(id => selected.has(id)).length;
  const state = n === 0 ? false : n === ids.length ? true : "indeterminate";
  const onChange = () => setSelected(prev => {
    const next = new Set(prev);
    ids.forEach(id => (n === ids.length ? next.delete(id) : next.add(id)));
    return next;
  });
  return <Checkbox checked={state} onCheckedChange={onChange} disabled={!ids.length} aria-label={label} />;
}

export default function BulkScopeSelectionList({ tree, selected, setSelected }) {
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="border border-gray-800 rounded-md max-h-[45vh] overflow-y-auto">
      {tree.map(cat => {
        const catIds = cat.groups.flatMap(g => g.items.filter(isEligible).map(i => i.id));
        const catSel = catIds.filter(id => selected.has(id)).length;
        return (
          <section key={cat.id} aria-label={cat.name}>
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-800 border-b border-gray-700">
              <TriCheckbox ids={catIds} selected={selected} setSelected={setSelected} label={`Select all available in ${cat.name}`} />
              <span className="text-xs font-bold uppercase tracking-wider text-white flex-1 min-w-0 truncate">{cat.name}</span>
              <span className="text-[11px] text-gray-400 shrink-0">{catSel}/{catIds.length} selected</span>
            </div>
            {cat.groups.map(g => {
              const ids = g.items.filter(isEligible).map(i => i.id);
              const sel = ids.filter(id => selected.has(id)).length;
              return (
                <div key={g.id} role="group" aria-label={`${cat.name} / ${g.name}`}>
                  <div className="flex items-center gap-2 pl-6 pr-3 py-1 bg-gray-900 border-b border-gray-800">
                    <TriCheckbox ids={ids} selected={selected} setSelected={setSelected} label={`Select all available in ${g.name}`} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-300 flex-1 min-w-0 truncate">{g.name}</span>
                    <span className="text-[11px] text-gray-500 shrink-0">{sel}/{ids.length}</span>
                  </div>
                  {g.items.map(item => isEligible(item) ? (
                    <label key={item.id} className="flex items-start gap-3 pl-10 pr-3 py-1.5 cursor-pointer hover:bg-gray-800/50 border-b border-gray-800/60">
                      <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} className="mt-0.5" />
                      <span className="text-sm text-white min-w-0">{item.title}</span>
                    </label>
                  ) : (
                    <div key={item.id} className="flex items-start gap-3 pl-10 pr-3 py-1.5 border-b border-gray-800/60 opacity-60" aria-disabled="true">
                      <ListChecks className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                      <span className="text-sm text-gray-300 min-w-0 flex-1">{item.title}</span>
                      <span className="text-[10px] text-emerald-300 border border-emerald-700/40 rounded px-1 shrink-0">Task Created</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}