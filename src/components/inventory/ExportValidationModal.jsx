import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  XCircle, 
  AlertCircle,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
  CheckCircle2
} from "lucide-react";
import { 
  PRICING_STATUS,
  getPricingStatusDisplay,
  getPricingSourceDisplay 
} from "./pricingIntegrityUtils";

/**
 * ExportValidationModal - Pre-validation modal before QuickBooks export
 * Shows pricing issues and allows export with warnings instead of hard fail
 */
export default function ExportValidationModal({ 
  isOpen, 
  onClose, 
  validationResult,
  onExportWithWarnings,
  onViewItems,
  buildName,
  isExporting = false
}) {
  const [showDetails, setShowDetails] = useState(false);
  
  if (!validationResult) return null;
  
  const { 
    isValid, 
    hasWarnings, 
    missingRetailItems, 
    missingCostItems, 
    zeroValueItems,
    metrics 
  } = validationResult;
  
  const canExport = missingRetailItems.length === 0; // Can export if no missing retail
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isValid ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : canExport ? (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            Export Validation - {buildName}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {isValid 
              ? "All pricing checks passed. Ready to export."
              : canExport 
                ? "Some pricing issues found. You can still export with warnings."
                : "Critical pricing issues found. Please resolve before exporting."
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Metrics Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-green-400">
                  {metrics.commitmentPricingPct}%
                </div>
                <div className="text-xs text-gray-400">Commitment Pricing</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-blue-400">
                  {metrics.fallbackPricingPct}%
                </div>
                <div className="text-xs text-gray-400">Fallback Pricing</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-red-400">
                  {metrics.missingPricingPct}%
                </div>
                <div className="text-xs text-gray-400">Missing Pricing</div>
              </CardContent>
            </Card>
          </div>
          
          {/* Issue Cards */}
          {missingRetailItems.length > 0 && (
            <Card className="bg-red-900/20 border-red-500/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-400">
                      {missingRetailItems.length} part(s) missing retail pricing
                    </h3>
                    <p className="text-sm text-red-300/80 mt-1">
                      Export is blocked. These parts need pricing before export.
                    </p>
                    <div className="mt-2 space-y-1">
                      {missingRetailItems.slice(0, 3).map((item, i) => (
                        <div key={i} className="text-xs text-red-300/70 flex items-center gap-2">
                          <span>•</span>
                          <span className="truncate">{item.partName}</span>
                          <span className="text-red-400/60 font-mono">${item.costValue?.toFixed(2) || '0.00'} cost</span>
                        </div>
                      ))}
                      {missingRetailItems.length > 3 && (
                        <div className="text-xs text-red-400/60">
                          ... and {missingRetailItems.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {missingCostItems.length > 0 && (
            <Card className="bg-orange-900/20 border-orange-500/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-orange-400">
                      {missingCostItems.length} part(s) missing cost data
                    </h3>
                    <p className="text-sm text-orange-300/80 mt-1">
                      Export can proceed, but margin calculations may be inaccurate.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {zeroValueItems.length > 0 && (
            <Card className="bg-amber-900/20 border-amber-500/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-400">
                      {zeroValueItems.length} part(s) with $0 values
                    </h3>
                    <p className="text-sm text-amber-300/80 mt-1">
                      These items have zero cost or retail pricing.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Details Toggle */}
          {(missingRetailItems.length > 0 || missingCostItems.length > 0 || zeroValueItems.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full text-gray-400 hover:text-white"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  Show All Issues ({missingRetailItems.length + missingCostItems.length + zeroValueItems.length})
                </>
              )}
            </Button>
          )}
          
          {showDetails && (
            <ScrollArea className="h-48 rounded-md border border-gray-700 bg-gray-800/30 p-3">
              <div className="space-y-2">
                {[...missingRetailItems, ...missingCostItems, ...zeroValueItems].map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-gray-700/50 pb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-white truncate">{item.partName}</div>
                      <div className="text-xs text-gray-500 font-mono">{item.partNumber || 'N/A'}</div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant="outline" className={getPricingStatusDisplay(item.status).className}>
                        {getPricingStatusDisplay(item.status).label}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          
          {isValid && (
            <Card className="bg-green-900/20 border-green-500/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <div>
                    <h3 className="font-semibold text-green-400">All pricing checks passed</h3>
                    <p className="text-sm text-green-300/80 mt-1">
                      {metrics.totalItems} items ready for export with complete pricing data.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-700">
            Cancel
          </Button>
          {onViewItems && (
            <Button variant="outline" onClick={onViewItems} className="border-blue-700 text-blue-400">
              <Eye className="w-4 h-4 mr-2" />
              View Items
            </Button>
          )}
          <Button
            onClick={onExportWithWarnings}
            disabled={!canExport || isExporting}
            className={canExport ? "bg-green-700 hover:bg-green-600" : "bg-gray-700"}
          >
            <Download className="w-4 h-4 mr-2" />
            {isValid ? "Export" : hasWarnings && canExport ? "Export With Warnings" : "Cannot Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}