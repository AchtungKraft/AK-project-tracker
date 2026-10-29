import React from "react";

// Compact stacked line for mobile: name on top, label/value grid, status line. Nothing is truncated.
export default function MobileLineCard({ title, sub, fields, status }) {
  return (
    <div className="border-t border-gray-800 py-2 text-xs text-gray-300">
      <div className="text-white break-words">{title}</div>
      {sub && <div className="text-[10px] text-gray-500 break-words">{sub}</div>}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
        {fields.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-gray-500">{label}</span><span className="text-right tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      {status && <div className="mt-1">{status}</div>}
    </div>
  );
}