import React, { useMemo } from "react";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  DollarSign,
  FileText,
  Package,
  Archive,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// CONFIDENCE CHECK ITEM
// ============================================

function ConfidenceCheckItem({ passed, label, description, critical = false }) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-2 rounded-lg transition-colors",
      passed ? "bg-green-950/20" : critical ? "bg-red-950/30" : "bg-yellow-950/20"
    )}>
      {passed ? (
        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
      ) : critical ? (
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
      )}
      <div>
        <p className={cn(
          "text-sm font-medium",
          passed ? "text-green-300" : critical ? "text-red-300" : "text-yellow-300"
        )}>
          {label}
        </p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function InvoiceConfidencePanel({ items }) {
  const checks = useMemo(() => {
    if (!items || items.length === 0) {
      return {
        pricingComplete: { passed: false, count: 0, total: 0 },
        commitmentBillable: { passed: false, count: 0, total: 0 },
        clientBillingEnabled: { passed: false, count: 0, total: 0 },
        lifecycleValid: { passed: false, count: 0, total: 0 },
        noArchived: { passed: true, count: 0, total: 0 },
        allPassed: false,
      };
    }

    const total = items.length;
    
    // Check 1: Pricing complete
    const pricingComplete = items.filter(i => (i.unit_retail || i.unit_price || 0) > 0).length;
    
    // Check 2: Commitment billable
    const commitmentBillable = items.filter(i => 
      i.billing_status !== 'not_billable' && i.financial_role !== 'NON_BILLABLE'
    ).length;
    
    // Check 3: Client billing enabled (requires_client_billing not false)
    const clientBillingEnabled = items.filter(i => 
      i.requires_client_billing !== false
    ).length;
    
    // Check 4: Lifecycle state valid (not cancelled, not already invoiced)
    const lifecycleValid = items.filter(i => 
      i.commitment_status !== 'cancelled' && 
      i.billing_status !== 'invoiced' &&
      i.billing_status !== 'paid'
    ).length;
    
    // Check 5: No archived commitments
    const noArchived = items.filter(i => !i.is_archived).length;

    return {
      pricingComplete: { passed: pricingComplete === total, count: pricingComplete, total },
      commitmentBillable: { passed: commitmentBillable === total, count: commitmentBillable, total },
      clientBillingEnabled: { passed: clientBillingEnabled === total, count: clientBillingEnabled, total },
      lifecycleValid: { passed: lifecycleValid === total, count: lifecycleValid, total },
      noArchived: { passed: noArchived === total, count: noArchived, total },
      allPassed: pricingComplete === total && commitmentBillable === total && 
                 clientBillingEnabled === total && lifecycleValid === total && noArchived === total,
    };
  }, [items]);

  const passedCount = [
    checks.pricingComplete.passed,
    checks.commitmentBillable.passed,
    checks.clientBillingEnabled.passed,
    checks.lifecycleValid.passed,
    checks.noArchived.passed,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Invoice Confidence Checklist
        </h4>
        <span className={cn(
          "text-sm font-medium",
          checks.allPassed ? "text-green-400" : passedCount >= 3 ? "text-yellow-400" : "text-red-400"
        )}>
          {passedCount}/5 checks passed
        </span>
      </div>
      
      <div className="grid gap-2">
        <ConfidenceCheckItem
          passed={checks.pricingComplete.passed}
          label="Pricing Complete"
          description={checks.pricingComplete.passed 
            ? "All items have retail pricing" 
            : `${checks.pricingComplete.count}/${checks.pricingComplete.total} items have pricing`}
          critical={!checks.pricingComplete.passed}
        />
        
        <ConfidenceCheckItem
          passed={checks.commitmentBillable.passed}
          label="Commitments Billable"
          description={checks.commitmentBillable.passed 
            ? "All commitments are marked billable" 
            : `${checks.commitmentBillable.count}/${checks.commitmentBillable.total} are billable`}
          critical={!checks.commitmentBillable.passed}
        />
        
        <ConfidenceCheckItem
          passed={checks.clientBillingEnabled.passed}
          label="Client Billing Enabled"
          description={checks.clientBillingEnabled.passed 
            ? "All parts allow client billing" 
            : `${checks.clientBillingEnabled.count}/${checks.clientBillingEnabled.total} allow billing`}
        />
        
        <ConfidenceCheckItem
          passed={checks.lifecycleValid.passed}
          label="Lifecycle State Valid"
          description={checks.lifecycleValid.passed 
            ? "No cancelled or already invoiced items" 
            : `${checks.lifecycleValid.count}/${checks.lifecycleValid.total} in valid state`}
          critical={!checks.lifecycleValid.passed}
        />
        
        <ConfidenceCheckItem
          passed={checks.noArchived.passed}
          label="No Archived Commitments"
          description={checks.noArchived.passed 
            ? "No archived commitments included" 
            : `${checks.noArchived.total - checks.noArchived.count} archived items found`}
        />
      </div>
      
      {!checks.allPassed && (
        <div className="mt-3 p-3 bg-yellow-950/30 border border-yellow-900/30 rounded-lg">
          <p className="text-xs text-yellow-300">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            Some checks failed. Review and fix issues before confirming, or proceed with caution.
          </p>
        </div>
      )}
    </div>
  );
}