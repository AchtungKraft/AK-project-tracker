import React from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CoverageDebugPanel — Read-model-only debug display for coverage math.
 * Shows canonical coverage fields, validation, and drift/flag warnings.
 * 
 * RULES:
 * - DO NOT compute coverage in UI — display read model values only
 * - DO NOT mutate data
 * - MUST reflect canonical invariant: required_total === reserved + covered + to_order
 */
export default function CoverageDebugPanel({ item }) {
  if (!item) return null;

  const debug = item._coverage_debug || {};
  const flags = item.debug_flags || {};
  const inv = item.inventory_snapshot || {};

  const required = item.required_total ?? 0;
  const reserved = item.reserved_from_stock ?? 0;
  const covered = item.covered_from_po ?? 0;
  const installed = item.qty_installed ?? 0;
  const toOrder = item.to_order ?? 0;

  const coverageTotal = item.coverage_total ?? (reserved + covered);
  const coverageGap = item.coverage_gap ?? (required - coverageTotal);
  const coverageActual = item.coverage_actual ?? (reserved + covered + toOrder);
  const coverageExpected = item.coverage_expected ?? required;
  const hasDrift = item.coverage_drift ?? debug.drift ?? (Math.abs(coverageActual - coverageExpected) > 0.01);

  const hasAnyFlag = flags.has_unallocated_stock || flags.has_po_but_not_covered || flags.is_dead_zone;

  return (
    <div className="mt-2 p-2.5 bg-gray-950 border border-gray-700/50 rounded text-[10px] font-mono space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-1.5 text-gray-500 uppercase tracking-widest text-[9px]">
        <span>Coverage Debug</span>
        {hasDrift ? (
          <XCircle className="w-3 h-3 text-red-500" />
        ) : hasAnyFlag ? (
          <AlertTriangle className="w-3 h-3 text-amber-500" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        )}
      </div>

      {/* Section 1: Coverage */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <Row label="REQ" value={required} />
        <Row label="TO ORDER" value={toOrder} color={toOrder > 0 ? "text-red-400" : "text-gray-500"} />
        <Row label="RESERVED" value={reserved} color={reserved > 0 ? "text-cyan-400" : "text-gray-500"} />
        <Row label="PO COVERED" value={covered} color={covered > 0 ? "text-purple-400" : "text-gray-500"} />
        <Row label="INSTALLED" value={installed} color={installed > 0 ? "text-emerald-400" : "text-gray-500"} />
        <Row label="COVERAGE" value={`${coverageTotal} / ${required}`} color={coverageTotal >= required ? "text-emerald-400" : "text-amber-400"} />
      </div>

      {/* Section 2: Raw Inputs */}
      <div className="border-t border-gray-800 pt-1.5">
        <div className="text-gray-600 text-[9px] mb-0.5">RAW INVENTORY</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <Row label="PHYS STOCK" value={inv.physical_stock ?? debug.physical_stock ?? '—'} />
          <Row label="AVAILABLE" value={inv.available ?? '—'} />
          <Row label="GLOBAL RSVD" value={inv.reserved_global_active ?? inv.reserved ?? '—'} />
          <Row label="THIS PROJ RSVD" value={inv.reserved_this_project ?? reserved} />
        </div>
      </div>

      {/* Section 3: Validation */}
      <div className="border-t border-gray-800 pt-1.5">
        <div className="text-gray-600 text-[9px] mb-0.5">INVARIANT CHECK</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <Row label="EXPECTED" value={coverageExpected} />
          <Row label="ACTUAL" value={coverageActual} color={hasDrift ? "text-red-400" : "text-gray-300"} />
          <Row label="GAP" value={coverageGap} color={coverageGap > 0 ? "text-amber-400" : "text-gray-500"} />
        </div>
        {hasDrift && (
          <div className="mt-1 px-1.5 py-1 bg-red-950/60 border border-red-800/50 rounded text-red-400 text-[10px] font-bold">
            ⚠ DRIFT DETECTED — expected={coverageExpected} actual={coverageActual}
          </div>
        )}
      </div>

      {/* Section 4: Flags */}
      {hasAnyFlag && (
        <div className="border-t border-gray-800 pt-1.5 space-y-1">
          <div className="text-gray-600 text-[9px]">FLAGS</div>
          {flags.has_unallocated_stock && (
            <FlagRow color="amber" text="Stock exists but not allocated" />
          )}
          {flags.has_po_but_not_covered && (
            <FlagRow color="amber" text="PO exists but not contributing to coverage" />
          )}
          {flags.is_dead_zone && (
            <FlagRow color="red" text="Dead zone: stock present but still needs order" />
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, color = "text-gray-300" }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}

function FlagRow({ color, text }) {
  const colorMap = {
    red: "bg-red-950/40 border-red-800/40 text-red-400",
    amber: "bg-amber-950/40 border-amber-800/40 text-amber-400",
  };
  return (
    <div className={cn("px-1.5 py-0.5 rounded border text-[9px]", colorMap[color] || colorMap.amber)}>
      ⚑ {text}
    </div>
  );
}