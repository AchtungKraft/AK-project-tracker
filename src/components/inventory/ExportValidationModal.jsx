import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  XCircle, 
  CheckCircle2, 
  Download, 
  Eye, 
  Loader2,
  ChevronDown,
  ChevronUp 
} from "lucide-react";
import { PricingStatusBadge, PricingSourceBadge } from "./PricingStatusBadge";

/**
 * ExportValidationModal - Pre-export validation with warnings instead of hard failures
 */
export default function ExportValidationModal({ 
  isOpen, 
  onClose, 
  validationResult,
  buildName,
  onExportWithWarnings,
  onExportClean,
  isExporting = false
}) {
  const [expandedSections, setExpandedSections] = useState(new Set(['errors']));

  if (!validationResult) return null;

  const { 
    missingRetail, 
    missingCost, 
    missingBoth, 
    zeroValue, 
    estimated,
    hasErrors, 
    hasWarnings, 
    canExport,
    metrics 
  } = validationResult;

  const toggleSection = (section) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const renderItemList = (items, title, sectionKey, variant = "warning") => {
    if (items.length === 0) return null;
    
    const isExpanded = expandedSections.has(sectionKey);
    const colors = {
      error: 'border-red-500/50 bg-red-950/20',
      warning: 'border-amber-500/50 bg-amber-950/20',
      info: 'border-blue-500/50 bg-blue-950/20'
    };
    const iconColors = {
      error: 'text-red-400',
      warning: 'text-amber-400',
      info: 'text-blue-400'
    };

    return (
      <Card className={`${colors[variant]} border`}>
        <div 
          className="p-3 flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection(sectionKey)}
        >
          <div className="flex items-center gap-2">
            {variant === 'error' ? (
              <XCircle className={`w-4 h-4 ${iconColors[variant]}`} />
            ) : (
              <AlertTriangle className={`w-4 h-4 ${iconColors[variant]}`} />
            )}
            <span className="font-medium text-white">{title}</span>
            <Badge variant="outline" className={`${iconColors[variant]} border-current`}>
              {items.length}
            </Badge>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
        
        {isExpanded && (
          <CardContent className="pt-0 pb-3">
            <ScrollArea className="max-h-40">
              <div className="space-y-1">
                {items.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-black/30">
                    <span className="text-gray-300 truncate flex-1">{item.part?.part_name || 'Unknown Part'}</span>
                    <div className="flex items-center gap-2">
                      {item.integrity && (
                        <>
                          <span className="text-gray-500 text-xs">
                            ${item.integrity.costValue?.toFixed(2) || '0.00'} / ${item.integrity.retailValue?.toFixed(2) || '0.00'}
                          </span>
                          <PricingSourceBadge source={item.integrity.pricingSource} size="sm" />
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {items.length > 10 && (
                  <p className="text-xs text-gray-500 text-center py-1">
                    ... and {items.length - 10} more
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasErrors ? (
              <XCircle className="w-5 h-5 text-red-400" />
            ) : hasWarnings ? (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            )}
            Export Validation
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Pre-export pricing validation for <strong className="text-white">{buildName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Metrics Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-purple-900/20 border-purple-500/30">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-purple-400">{metrics.commitmentPricingPct}%</div>
                <div className="text-xs text-gray-400">Commitment Pricing</div>
              </CardContent>
            </Card>
            <Card className="bg-blue-900/20 border-blue-500/30">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-blue-400">{metrics.fallbackPricingPct}%</div>
                <div className="text-xs text-gray-400">Fallback Pricing</div>
              </CardContent>
            </Card>
            <Card className="bg-red-900/20 border-red-500/30">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-red-400">{metrics.missingPricingPct}%</div>
                <div className="text-xs text-gray-400">Missing Pricing</div>
              </CardContent>
            </Card>
          </div>

          {/* Status Summary */}
          {!hasErrors && !hasWarnings && (
            <Card className="bg-green-900/20 border-green-500/50">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
                <div>
                  <h3 className="font-semibold text-green-400">All Clear!</h3>
                  <p className="text-sm text-gray-400">All items have valid pricing data.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Sections (Block Export) */}
          {renderItemList(missingBoth, 'Missing Both Cost & Retail', 'missingBoth', 'error')}
          {renderItemList(missingRetail, 'Missing Retail Price', 'missingRetail', 'error')}

          {/* Warning Sections (Allow Export) */}
          {renderItemList(zeroValue, '$0 Pricing Values', 'zeroValue', 'warning')}
          {renderItemList(missingCost, 'Missing Cost Data', 'missingCost', 'warning')}
          {renderItemList(estimated, 'Estimated Costs (Fallback)', 'estimated', 'info')}

          {/* Export Options Info */}
          {hasWarnings && !hasErrors && (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-3 text-xs text-gray-400">
                <p><strong>Export With Warnings</strong> will include additional columns:</p>
                <ul className="list-disc ml-4 mt-1 space-y-0.5">
                  <li><code className="text-blue-400">pricing_integrity_status</code> - Pricing data quality</li>
                  <li><code className="text-blue-400">pricing_source</code> - Where pricing came from</li>
                  <li><code className="text-blue-400">export_warning_flag</code> - Items needing review</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-700">
            Cancel
          </Button>
          
          {hasErrors ? (
            <Button disabled className="bg-gray-700">
              <XCircle className="w-4 h-4 mr-2" />
              Cannot Export ({missingRetail.length + missingBoth.length} errors)
            </Button>
          ) : hasWarnings ? (
            <>
              <Button 
                onClick={onExportWithWarnings}
                disabled={isExporting}
                className="bg-amber-700 hover:bg-amber-600"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                Export With Warnings
              </Button>
            </>
          ) : (
            <Button 
              onClick={onExportClean}
              disabled={isExporting}
              className="bg-green-700 hover:bg-green-600"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}