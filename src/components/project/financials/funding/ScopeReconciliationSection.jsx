import React, { useState } from "react";
import { Loader2, Info } from "lucide-react";
import ReconTotals from "./ReconTotals";
import ReconTree from "./ReconTree";
import UnattributedPanel from "./UnattributedPanel";
import TaskCostComparison from "./TaskCostComparison";
import { useScopeFunding } from "../useFinancialQueries";

const Sub = ({ title, children }) => <div className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h4>{children}</div>;

// Read-only scope / purchasing reconciliation. Never invents a baseline or assigns parts to scope items.
export default function ScopeReconciliationSection({ projectId }) {
  const [showUnattr, setShowUnattr] = useState(false);
  const { recon, forbidden, loading, errorText, ready } = useScopeFunding(projectId);
  if (forbidden) return null;
  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;
  if (!ready) return <p className="text-xs text-red-400">Could not load: {errorText}</p>;
  const d = recon.data;
  const hasBaseline = (d.approved_totals?.items ?? 0) > 0;
  return (
    <div className="space-y-4">
      {!hasBaseline && (
        <div className="flex items-start gap-2 text-xs text-gray-300 bg-gray-900/60 border border-gray-800 rounded-md px-3 py-2">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <span><strong>Original estimate unavailable.</strong> This project has no client-approved scope baseline. Figures here are current task estimates and recorded purchasing, not a historical baseline. Parts are not assigned to scope items automatically.</span>
        </div>
      )}
      <ReconTotals data={d} />
      <Sub title="Task-level linked part / PO cost"><TaskCostComparison data={d} projectId={projectId} /></Sub>
      {hasBaseline && <Sub title="Approved scope tree">{d.tree.length ? <ReconTree tree={d.tree} /> : <p className="text-xs text-gray-500">No approved scope items.</p>}</Sub>}
      {d.excluded_from_budget.length > 0 && <p className="text-xs text-amber-300">{d.excluded_from_budget.length} approved item(s) need review and are not in the approved budget.</p>}
      <div className="space-y-2">
        <button onClick={() => setShowUnattr(!showUnattr)} className="text-xs text-amber-200 hover:underline">
          {showUnattr ? "Hide" : "Show"} project-level sources without a scope link ({d.totals.unattributed_commitments} part(s), {d.unattributed.services.length} service(s))
        </button>
        {showUnattr && <UnattributedPanel data={d} />}
      </div>
    </div>
  );
}