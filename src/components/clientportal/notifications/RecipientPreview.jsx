import React from "react";

export default function RecipientPreview({ recipients, excluded, isDraft }) {
  return (
    <div className="text-xs space-y-1">
      <div className="text-gray-500 uppercase tracking-wide text-[10px]">Current recipients (from project portal access)</div>
      {isDraft && <p className="text-amber-400">This request is a draft — clients are not notified until it is posted.</p>}
      {recipients.length === 0 ? (
        <p className="text-gray-500 italic">No authorized contacts with email notifications on.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {recipients.map((r) => (
            <span key={r.email} className="px-2 py-0.5 rounded bg-gray-800 text-gray-200" title={r.email}>
              {r.name} <span className="text-gray-500">· {r.access_role}</span>
            </span>
          ))}
        </div>
      )}
      {excluded.length > 0 && (
        <p className="text-gray-500">
          Excluded: {excluded.map((x) => `${x.name} (${x.reason})`).join(", ")}
        </p>
      )}
    </div>
  );
}