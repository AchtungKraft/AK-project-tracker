import React from "react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const m = (v) => (v == null ? "Pending" : formatCurrencyUSD(v));

// Parts invoiced before they were received: estimated cost on the invoice line vs actual purchase cost, and final margin.
export default function ProjectedPartsCostTable({ rows }) {
  return (
    <div className="space-y-2">
      {!rows.length ? <p className="text-xs text-gray-500">No issued invoices include projected parts.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead><tr className="text-left text-gray-500 border-b border-gray-800">
              {["Part", "Qty", "Received", "Invoiced", "Est. cost", "Actual cost", "Final margin"].map((t) => <th key={t} className="py-1.5 pr-2 font-medium">{t}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line_id} className="border-b border-gray-900 text-gray-300">
                  <td className="py-1.5 pr-2 text-white max-w-[16rem] truncate">{r.description}</td>
                  <td className="pr-2">{r.qty}</td>
                  <td className="pr-2">{r.received_qty}</td>
                  <td className="pr-2">{formatCurrencyUSD(r.line_total)}</td>
                  <td className="pr-2">{formatCurrencyUSD(r.estimated_cost)}</td>
                  <td className="pr-2">{m(r.actual_cost)}</td>
                  <td className={r.final_margin != null && r.final_margin < 0 ? "pr-2 text-red-400" : "pr-2"}>{m(r.final_margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}