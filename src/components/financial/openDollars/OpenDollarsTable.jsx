import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import OpenDollarsFlags from "./OpenDollarsFlags";
import OpenDollarsMobileCard from "./OpenDollarsMobileCard";

const Money = ({ v, className = "text-gray-300" }) => (
  <TableCell className={`text-right font-mono ${className}`}>{v ? formatCurrencyUSD(v) : <span className="text-gray-600">—</span>}</TableCell>
);

// Per-project breakdown. Desktop: table. Mobile: cards.
export default function OpenDollarsTable({ rows, onCreateInvoice }) {
  if (!rows.length) return <p className="text-sm text-gray-500 py-6 text-center">No open dollars.</p>;
  return (
    <>
      <div className="md:hidden space-y-2">
        {rows.map((r) => <OpenDollarsMobileCard key={r.project_id} row={r} onCreateInvoice={onCreateInvoice} />)}
      </div>
      <div className="hidden md:block rounded-lg border border-gray-800 bg-gray-900/50">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-400">Project</TableHead>
              <TableHead className="text-gray-400 text-right">Parts</TableHead>
              <TableHead className="text-gray-400 text-right">Services</TableHead>
              <TableHead className="text-gray-400 text-right">Labor</TableHead>
              <TableHead className="text-gray-400 text-right">Unbilled</TableHead>
              <TableHead className="text-gray-400 text-right">On drafts</TableHead>
              <TableHead className="text-gray-400 text-right">Outstanding</TableHead>
              <TableHead className="text-gray-400 text-right">Total open</TableHead>
              <TableHead className="text-gray-400">Review</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.project_id} className="border-gray-800">
                <TableCell className="max-w-[220px]">
                  <p className="text-white font-medium truncate" title={r.project_name}>{r.project_name}</p>
                  {r.client_name && <p className="text-xs text-gray-500 truncate">{r.client_name}</p>}
                </TableCell>
                <Money v={r.unbilled.parts} />
                <Money v={r.unbilled.services} />
                <Money v={r.unbilled.labor} />
                <Money v={r.unbilled.total} className="text-white" />
                <Money v={r.on_drafts} className="text-gray-400" />
                <Money v={r.outstanding} className="text-purple-300" />
                <Money v={r.total_open} className="text-emerald-300 font-semibold" />
                <TableCell><OpenDollarsFlags flags={r.flags} /></TableCell>
                <TableCell>
                  {r.unbilled.total > 0 && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onCreateInvoice(r.project_id)}>Invoice</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}