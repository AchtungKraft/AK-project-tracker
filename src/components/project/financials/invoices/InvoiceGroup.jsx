import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import InvoiceListRow from "./InvoiceListRow";

export default function InvoiceGroup({ title, invoices, onOpen, emptyText, collapsible = false }) {
  const [open, setOpen] = useState(!collapsible);
  if (collapsible && invoices.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-800 bg-black/30">
      <button
        onClick={() => collapsible && setOpen(!open)}
        className="w-full flex items-center gap-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-800"
      >
        {collapsible && (open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
        {title} ({invoices.length})
      </button>
      {open && (invoices.length === 0
        ? <p className="px-3 py-3 text-xs text-gray-500">{emptyText}</p>
        : invoices.map((inv) => <InvoiceListRow key={inv.id} invoice={inv} onOpen={onOpen} />))}
    </div>
  );
}