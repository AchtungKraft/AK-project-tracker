import React, { useMemo } from "react";
import { AlertTriangle, DollarSign, Truck, TrendingUp, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProjectFinancialWarningBanner
 * 
 * Displays a warning banner when project has parts requiring financial attention.
 * Uses pre-resolved financial status data (from useFinancialStatusBatch).
 * 
 * @param {Object[]} financialStatuses - Array of resolved financial status objects
 * @param {Function} onFilterClick - Callback when user clicks to filter (receives filter key)
 */
export default function ProjectFinancialWarningBanner({ 
  financialStatuses = [], 
  onFilterClick,
  className,
}) {
  // Calculate warning counts from financial statuses
  const warnings = useMemo(() => {
    if (!financialStatuses || financialStatuses.length === 0) {
      return { hasWarnings: false, unbilled: 0, vendorUnpaid: 0, marginIncomplete: 0 };
    }

    let unbilled = 0;
    let vendorUnpaid = 0;
    let marginIncomplete = 0;

    financialStatuses.forEach(fs => {
      if (!fs) return;
      
      // Count unbilled (NOT_INVOICED status for billable parts)
      if (fs.client_billing_status === 'NOT_INVOICED' && 
          fs.financial_role !== 'NON_BILLABLE' &&
          fs.financial_role !== 'LABOR_ONLY') {
        unbilled++;
      }
      
      // Count vendor unpaid (UNPAID or PARTIAL for parts with vendor costs)
      if ((fs.vendor_payment_status === 'UNPAID' || fs.vendor_payment_status === 'PARTIAL') &&
          fs.financial_role === 'VENDOR_MARGIN') {
        vendorUnpaid++;
      }
      
      // Count margin incomplete (anything not COMPLETE)
      if (fs.margin_state !== 'COMPLETE' && fs.margin_state !== 'UNKNOWN') {
        marginIncomplete++;
      }
    });

    return {
      hasWarnings: unbilled > 0 || vendorUnpaid > 0 || marginIncomplete > 0,
      unbilled,
      vendorUnpaid,
      marginIncomplete,
    };
  }, [financialStatuses]);

  // Don't render if no warnings
  if (!warnings.hasWarnings) {
    return null;
  }

  return (
    <div className={cn(
      "bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4",
      className
    )}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-yellow-300 font-medium text-sm mb-2">
            Project has financial items requiring attention
          </h4>
          
          <div className="flex flex-wrap gap-3">
            {warnings.unbilled > 0 && (
              <button
                onClick={() => onFilterClick?.('unbilled')}
                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-800/30 hover:bg-yellow-800/50 rounded-lg transition-colors group"
              >
                <DollarSign className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-200 text-sm">
                  {warnings.unbilled} Part{warnings.unbilled !== 1 ? 's' : ''} Not Yet Billed
                </span>
                <ChevronRight className="w-3 h-3 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            
            {warnings.vendorUnpaid > 0 && (
              <button
                onClick={() => onFilterClick?.('vendor_unpaid')}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-800/30 hover:bg-red-800/50 rounded-lg transition-colors group"
              >
                <Truck className="w-4 h-4 text-red-400" />
                <span className="text-red-200 text-sm">
                  {warnings.vendorUnpaid} Vendor Cost{warnings.vendorUnpaid !== 1 ? 's' : ''} Unpaid
                </span>
                <ChevronRight className="w-3 h-3 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            
            {warnings.marginIncomplete > 0 && (
              <button
                onClick={() => onFilterClick?.('margin_incomplete')}
                className="flex items-center gap-2 px-3 py-1.5 bg-orange-800/30 hover:bg-orange-800/50 rounded-lg transition-colors group"
              >
                <TrendingUp className="w-4 h-4 text-orange-400" />
                <span className="text-orange-200 text-sm">
                  {warnings.marginIncomplete} Part{warnings.marginIncomplete !== 1 ? 's' : ''} Margin Incomplete
                </span>
                <ChevronRight className="w-3 h-3 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}