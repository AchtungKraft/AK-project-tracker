import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Search, Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCanonicalPartState, STATE_DISPLAY, aggregateCanonicalMetrics } from "./canonicalPartState";

/**
 * SupplyStateDiagnostics — Admin-only per-item state inspection panel
 * 
 * For each commitment shows:
 *   - Part name
 *   - Canonical state
 *   - All quantities: Required, Reserved, On Order, Installed, Ready, Gap
 *   - How summary totals were derived
 */

function DiagRow({ item }) {
  const { state, quantities: q } = resolveCanonicalPartState(item);
  const display = STATE_DISPLAY[state] || STATE_DISPLAY.PLANNED;

  return (
    <tr className="border-b border-gray-800/30 text-xs hover:bg-gray-800/20">
      <td className="py-1.5 px-2 text-white truncate max-w-[200px]" title={item.part?.part_name}>
        {item.part?.part_name || 'Unknown'}
      </td>
      <td className="py-1.5 px-2">
        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", display.bgColor, display.color)}>
          {display.label}
        </span>
      </td>
      <td className="py-1.5 px-1 font-mono text-right text-gray-300">{q.requiredQty}</td>
      <td className="py-1.5 px-1 font-mono text-right text-cyan-400">{q.reservedQty}</td>
      <td className="py-1.5 px-1 font-mono text-right text-blue-400">{q.onOrderQty}</td>
      <td className="py-1.5 px-1 font-mono text-right text-emerald-400">{q.installedQty}</td>
      <td className="py-1.5 px-1 font-mono text-right text-green-400">{q.readyToInstallQty}</td>
      <td className="py-1.5 px-1 font-mono text-right">
        {q.gapQty > 0 ? <span className="text-red-400">{q.gapQty}</span> : <span className="text-gray-600">0</span>}
      </td>
      <td className="py-1.5 px-1 font-mono text-right text-gray-500">{q.coveredQty}</td>
    </tr>
  );
}

export default function SupplyStateDiagnostics({ items = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');

  const { qty, counts, progressPct } = useMemo(
    () => aggregateCanonicalMetrics(items),
    [items]
  );

  const filtered = useMemo(() => {
    if (!search) return items;
    const term = search.toLowerCase();
    return items.filter(i =>
      i.part?.part_name?.toLowerCase().includes(term) ||
      i.part?.vendor_part_number?.toLowerCase().includes(term)
    );
  }, [items, search]);

  if (!expanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setExpanded(true)}
        className="border-amber-700 text-amber-400 text-xs gap-1.5"
      >
        <Bug className="w-3.5 h-3.5" />
        State Diagnostics ({items.length} items)
      </Button>
    );
  }

  return (
    <Card className="bg-gray-900/80 border-amber-800/50">
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-amber-400" />
          <CardTitle className="text-sm text-amber-400">Canonical State Diagnostics</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} className="h-6 w-6 p-0">
          <ChevronUp className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        {/* Aggregated totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-500">Progress</div>
            <div className="text-white font-bold">{progressPct}% ({qty.installed}/{qty.required} units)</div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-500">State Counts</div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(counts).filter(([k]) => k !== 'total').map(([k, v]) => (
                <span key={k} className={cn("font-mono", STATE_DISPLAY[k]?.color || 'text-gray-400')}>
                  {v} {STATE_DISPLAY[k]?.label || k}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-500">Qty Totals</div>
            <div className="font-mono text-gray-300">
              Req:{qty.required} Ready:{qty.readyToInstall} PO:{qty.onOrder} Inst:{qty.installed}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-gray-500">Risk</div>
            <div className="font-mono">
              <span className="text-red-400">Gap: {qty.gap}</span>
              {' · '}
              <span className="text-cyan-400">Res: {qty.reserved}</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input
            placeholder="Search parts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs bg-gray-800/50 border-gray-700"
          />
        </div>

        {/* Per-item table */}
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-700 text-gray-500">
                <th className="py-1 px-2 text-left">Part</th>
                <th className="py-1 px-2 text-left">State</th>
                <th className="py-1 px-1 text-right">Req</th>
                <th className="py-1 px-1 text-right">Res</th>
                <th className="py-1 px-1 text-right">PO</th>
                <th className="py-1 px-1 text-right">Inst</th>
                <th className="py-1 px-1 text-right">Ready</th>
                <th className="py-1 px-1 text-right">Gap</th>
                <th className="py-1 px-1 text-right">Cov</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <DiagRow key={item.id || item.commitment_id} item={item} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[10px] text-gray-600">
          Showing {filtered.length} of {items.length} items · State derived from canonicalPartState resolver
        </div>
      </CardContent>
    </Card>
  );
}