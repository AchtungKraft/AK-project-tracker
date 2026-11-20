import React from "react";
import { Lock } from "lucide-react";

// Shown in place of any invoice action in the funding section. No invoice action is rendered here.
export default function BillingDisabledNotice() {
  return (
    <div className="flex items-start gap-2 text-xs text-amber-200 bg-amber-950/30 border border-amber-900/50 rounded-md px-3 py-2">
      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
      <span><strong>Deposit milestones are a plan only.</strong> They are not cash and create no invoices, payments or credits. Create deposit and progress invoices from Invoices &amp; Payments.</span>
    </div>
  );
}