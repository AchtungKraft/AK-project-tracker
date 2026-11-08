import React from "react";
import { Info } from "lucide-react";
import FundingStatusBanner from "./FundingStatusBanner";
import FundingColumn from "./FundingColumn";
import ReconColumn from "./ReconColumn";
import FvrStat from "./FvrStat";
import { fundingStatus } from "./fundingStatus";

// Down payment vs reconciled costs — the primary shop view. Read only.
export default function FundingVsReconDashboard({ plan, data }) {
  const fa = data.funding_actuals;
  return (
    <div className="space-y-2" aria-label="Funding vs Reconciliation">
      <FundingStatusBanner status={fundingStatus(plan, fa)} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <FundingColumn plan={plan} fa={fa} />
        <ReconColumn data={data} />
      </div>
      <div className="rounded-md bg-gray-900/50 border border-gray-800 px-3 py-1">
        <FvrStat label="Cash available / estimated cash coverage" na sub={data.cash_available.reason} />
      </div>
      <p className="flex gap-1.5 text-[11px] text-gray-500"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />Funding received = client payments recorded on invoices. Credit remaining = unapplied ledger balance owed back to the client on future invoices. Neither is cash on hand.</p>
    </div>
  );
}