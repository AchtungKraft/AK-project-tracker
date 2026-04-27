import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * BillingValidationBanner — Shows when billing logic validation fails.
 * Only visible to dev/admin users. Surfaces _validation from getProjectsBillingSummary.
 */
export default function BillingValidationBanner({ validation }) {
  if (!validation || validation.ok !== false) return null;

  const failures = validation.failures || [];
  const errorCount = failures.reduce((s, f) => s + (f.errors?.length || 0), 0);

  return (
    <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
      <div className="space-y-1 min-w-0">
        <p className="text-red-300 font-medium text-sm">
          Billing logic inconsistency detected
        </p>
        <p className="text-red-400/80 text-xs">
          {errorCount} validation error{errorCount !== 1 ? 's' : ''} found.
          Invoice creation may be blocked until resolved.
        </p>
        {failures.length > 0 && (
          <ul className="text-xs text-red-400/70 list-disc ml-4 mt-1 space-y-0.5">
            {failures.slice(0, 5).map((f, i) => (
              <li key={i}>
                {f.project_id ? `Project ${f.project_id}: ` : ''}
                {f.source || 'unknown'} — {(f.errors || []).slice(0, 2).join(', ')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}