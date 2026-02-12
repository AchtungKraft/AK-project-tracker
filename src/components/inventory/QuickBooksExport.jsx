import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  FileSpreadsheet, 
  Download, 
  Loader2, 
  AlertTriangle,
  RefreshCw,
  XCircle,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { getMarkupFromMatrix, calculateUnitRetail, applyRetailPricing } from "./pricingUtils";
import { getPricingIntegrity, validateBuildPricing, PRICING_STATUS } from "./pricingIntegrityUtils";
import { PricingStatusBadge, PricingSourceBadge } from "./PricingStatusBadge";
import ExportValidationModal from "./ExportValidationModal";

/**
 * QuickBooksExport - Component for exporting build parts to QuickBooks CSV format
 */
export default function QuickBooksExport({ buildId, buildName, clientName }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [recalculatingPricing, setRecalculatingPricing] = useState(false);

  // Fetch all required data
  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list(),
  });

  const { data: buildAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list(),
  });

  const { data: matrixTiers = [] } = useQuery({
    queryKey: ['retailMarkupMatrix'],
    queryFn: () => base44.entities.RetailMarkupMatrix.list(),
  });

  // Phase 2F: Fetch commitments for pricing authority
  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.list(),
  });

  // Get category name (with parent if applicable)
  const getCategoryName = (part) => {
    const category = categories.find(c => c.id === part.part_category_id);
    if (!category) return 'Uncategorized';
    
    if (category.parent_id) {
      const parent = categories.find(c => c.id === category.parent_id);
      return parent ? `${parent.name} / ${category.name}` : category.name;
    }
    return category.name;
  };

  /**
   * Phase 2F - Export pricing priority:
   * 1. commitment.unit_retail_snapshot (PRIMARY - authoritative)
   * 2. fallback PartBuildAssignment.unit_retail
   * 3. fallback Part.default_retail
   * 4. flag error
   * 
   * Cost priority:
   * 1. commitment.actual_unit_cost (from vendor invoice)
   * 2. fallback commitment.unit_cost_snapshot
   * 3. fallback PO line item unit_cost
   */
  const exportData = useMemo(() => {
    const items = [];
    const processedPartIds = new Set();

    // Get commitments for this build
    const buildCommitments = commitments.filter(c => 
      c.project_id === buildId && 
      c.commitment_status !== 'cancelled'
    );

    // Primary source: PartBuildAssignment (has pricing and qty_needed)
    const buildAssigns = buildAssignments.filter(ba => ba.project_id === buildId);
    buildAssigns.forEach(ba => {
      if (processedPartIds.has(ba.part_id)) return;
      processedPartIds.add(ba.part_id);

      const part = parts.find(p => p.id === ba.part_id);
      if (!part) return;

      // Use qty_needed from assignment
      const qtyNeeded = ba.qty_needed || 0;
      if (qtyNeeded <= 0) return;

      // Find matching commitment(s) for this part
      const partCommitments = buildCommitments.filter(c => c.part_id === ba.part_id);
      
      // Phase 2F: Pricing cascade
      let unitRetail = 0;
      let unitCost = 0;
      let pricingSource = 'none';
      let appliedMarkup = ba.applied_markup_pct || 0;
      let needsPricingUpdate = false;
      let pricingIntegrityStatus = null;

      // Step 1: Try commitment pricing (authoritative)
      if (partCommitments.length > 0) {
        const primaryCommitment = partCommitments[0];
        pricingIntegrityStatus = primaryCommitment.pricing_integrity_status;
        
        if (primaryCommitment.unit_retail_snapshot && primaryCommitment.unit_retail_snapshot > 0) {
          unitRetail = primaryCommitment.unit_retail_snapshot;
          pricingSource = 'commitment';
        }
        
        // Cost: actual > snapshot
        if (primaryCommitment.actual_unit_cost && primaryCommitment.actual_unit_cost > 0) {
          unitCost = primaryCommitment.actual_unit_cost;
        } else if (primaryCommitment.unit_cost_snapshot && primaryCommitment.unit_cost_snapshot > 0) {
          unitCost = primaryCommitment.unit_cost_snapshot;
        }
      }

      // Step 2: Fallback to assignment pricing
      if (unitRetail === 0) {
        if (ba.pricing_locked && ba.unit_retail_override != null && ba.unit_retail_override > 0) {
          unitRetail = ba.unit_retail_override;
          pricingSource = 'override';
        } else if (ba.unit_retail != null && ba.unit_retail > 0) {
          unitRetail = ba.unit_retail;
          pricingSource = 'assignment';
        }
      }

      // Step 3: Fallback to part default retail
      if (unitRetail === 0 && part.default_retail && part.default_retail > 0) {
        unitRetail = part.default_retail;
        pricingSource = 'part_default';
      }

      // Step 4: Flag error if still no pricing
      if (unitRetail === 0) {
        needsPricingUpdate = true;
      }

      // Cost fallback
      if (unitCost === 0) {
        unitCost = ba.default_cost || part.default_cost || 0;
      }

      const category = getCategoryName(part);
      const description = `${category} / ${part.part_name} / ${part.vendor_part_number || 'N/A'}`;

      items.push({
        partId: part.id,
        requirementId: null,
        assignmentId: ba.id,
        commitmentIds: partCommitments.map(c => c.id),
        partName: part.part_name,
        partNumber: part.vendor_part_number || '',
        category,
        description,
        qtyNeeded,
        defaultCost: unitCost,
        unitRetail,
        pricingSource,
        pricingIntegrityStatus,
        appliedMarkup,
        pricingLocked: ba.pricing_locked || false,
        needsPricingUpdate
      });
    });

    // Secondary: requirements without assignments (shouldn't happen but handle gracefully)
    const buildRequirements = requirements.filter(r => r.project_id === buildId);
    buildRequirements.forEach(req => {
      if (processedPartIds.has(req.part_id)) return;
      processedPartIds.add(req.part_id);

      const part = parts.find(p => p.id === req.part_id);
      if (!part) return;

      const qtyNeeded = req.qty_needed || 0;
      if (qtyNeeded <= 0) return;

      // Check for commitments even without assignment
      const partCommitments = buildCommitments.filter(c => c.part_id === req.part_id);
      
      let unitRetail = 0;
      let pricingSource = 'none';
      let pricingIntegrityStatus = null;

      if (partCommitments.length > 0) {
        const primaryCommitment = partCommitments[0];
        pricingIntegrityStatus = primaryCommitment.pricing_integrity_status;
        
        if (primaryCommitment.unit_retail_snapshot && primaryCommitment.unit_retail_snapshot > 0) {
          unitRetail = primaryCommitment.unit_retail_snapshot;
          pricingSource = 'commitment';
        }
      }

      // Fallback to part default
      if (unitRetail === 0 && part.default_retail && part.default_retail > 0) {
        unitRetail = part.default_retail;
        pricingSource = 'part_default';
      }

      const category = getCategoryName(part);
      const description = `${category} / ${part.part_name} / ${part.vendor_part_number || 'N/A'}`;

      items.push({
        partId: part.id,
        requirementId: req.id,
        assignmentId: null,
        commitmentIds: partCommitments.map(c => c.id),
        partName: part.part_name,
        partNumber: part.vendor_part_number || '',
        category,
        description,
        qtyNeeded,
        defaultCost: part.default_cost || 0,
        unitRetail,
        pricingSource,
        pricingIntegrityStatus,
        appliedMarkup: 0,
        pricingLocked: false,
        needsPricingUpdate: unitRetail === 0
      });
    });

    return items;
  }, [buildId, parts, categories, requirements, buildAssignments, commitments, matrixTiers]);

  const itemsNeedingPricing = exportData.filter(d => d.needsPricingUpdate);
  const totalRetail = exportData.reduce((sum, d) => sum + (d.unitRetail * d.qtyNeeded), 0);

  // Build validation data using new pricing integrity system
  const validationResult = useMemo(() => {
    const validationItems = exportData.map(item => {
      const commitment = commitments.find(c => 
        c.project_id === buildId && 
        c.part_id === item.partId && 
        c.commitment_status !== 'cancelled'
      );
      const assignment = buildAssignments.find(ba => ba.id === item.assignmentId);
      const part = parts.find(p => p.id === item.partId);
      
      return {
        commitment,
        assignment,
        part,
        lineItem: null,
        qty: item.qtyNeeded,
        ...item
      };
    });
    
    return validateBuildPricing(validationItems);
  }, [exportData, commitments, buildAssignments, parts, buildId]);

  // Recalculate and save pricing for items that need it
  const recalculatePricing = async () => {
    setRecalculatingPricing(true);
    try {
      const updates = [];
      
      for (const item of itemsNeedingPricing) {
        if (!item.assignmentId) continue;
        
        const cost = item.defaultCost;
        const tier = getMarkupFromMatrix(cost, matrixTiers);
        if (!tier) continue;
        
        const unitRetail = calculateUnitRetail(cost, tier);
        
        updates.push(
          base44.entities.PartBuildAssignment.update(item.assignmentId, {
            default_cost: cost,
            unit_retail: unitRetail,
            applied_markup_pct: tier.markup_pct,
            pricing_source: 'matrix'
          })
        );
      }

      await Promise.all(updates);
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
      toast.success(`Updated pricing for ${updates.length} items`);
    } catch (error) {
      toast.error('Failed to update pricing: ' + error.message);
    } finally {
      setRecalculatingPricing(false);
    }
  };

  // Items missing pricing (validation)
  const itemsMissingPricing = exportData.filter(d => !d.unitRetail || d.unitRetail <= 0);

  // Open validation modal instead of direct export
  const handleExportClick = () => {
    setShowValidationModal(true);
  };

  // Export to QuickBooks CSV (clean - no warnings columns)
  const exportToQuickBooksClean = () => {
    performExport(false);
  };

  // Export with warning metadata columns
  const exportToQuickBooksWithWarnings = () => {
    performExport(true);
  };

  const performExport = (includeWarnings = false) => {
    setIsExporting(true);
    try {
      // QuickBooks CSV headers
      const headers = includeWarnings 
        ? ['Product/Service', 'Description', 'Qty', 'Rate', 'pricing_integrity_status', 'pricing_source', 'export_warning_flag']
        : ['Product/Service', 'Description', 'Qty', 'Rate'];

      const rows = exportData
        .filter(item => item.qtyNeeded > 0 && item.unitRetail > 0)
        .map(item => {
          const baseRow = [
            'Build_Parts',
            item.description,
            item.qtyNeeded,
            item.unitRetail.toFixed(2)
          ];
          
          if (includeWarnings) {
            const warningFlag = item.needsPricingUpdate || item.pricingSource === 'part_default' ? 'REVIEW' : '';
            baseRow.push(
              item.pricingIntegrityStatus || 'ok',
              item.pricingSource || 'none',
              warningFlag
            );
          }
          
          return baseRow;
        });

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${buildName.replace(/[^a-z0-9]/gi, '_')}_quickbooks_export.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Log export metrics to console
      console.log('=== QuickBooks Export Metrics ===');
      console.log(`Build: ${buildName}`);
      console.log(`Total Items: ${validationResult.metrics.total}`);
      console.log(`Commitment Pricing: ${validationResult.metrics.commitmentPricingPct}%`);
      console.log(`Fallback Pricing: ${validationResult.metrics.fallbackPricingPct}%`);
      console.log(`Missing Pricing: ${validationResult.metrics.missingPricingPct}%`);
      console.log('================================');

      toast.success('QuickBooks CSV exported successfully');
      setShowValidationModal(false);
      setShowDialog(false);
    } catch (error) {
      toast.error('Failed to export: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (!buildId) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowDialog(true)}
        className="border-green-700 text-green-400 hover:bg-green-700/20"
      >
        <FileSpreadsheet className="w-4 h-4 mr-2" />
        QuickBooks Export
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-400" />
              QuickBooks Export
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Export build parts for <strong className="text-white">{buildName}</strong> to QuickBooks format
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-white">{exportData.length}</div>
                  <div className="text-xs text-gray-400">Line Items</div>
                </CardContent>
              </Card>
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">${totalRetail.toFixed(2)}</div>
                  <div className="text-xs text-gray-400">Total Retail</div>
                </CardContent>
              </Card>
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-white">
                    {exportData.reduce((sum, d) => sum + d.qtyNeeded, 0)}
                  </div>
                  <div className="text-xs text-gray-400">Total Qty</div>
                </CardContent>
              </Card>
            </div>

            {/* Validation Summary Card */}
            <Card className={`border ${
              validationResult.hasErrors 
                ? 'bg-red-900/20 border-red-500/50' 
                : validationResult.hasWarnings 
                  ? 'bg-amber-900/20 border-amber-500/50'
                  : 'bg-green-900/20 border-green-500/50'
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    {validationResult.hasErrors ? (
                      <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
                    ) : validationResult.hasWarnings ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                    )}
                    <div>
                      <h3 className={`font-semibold ${
                        validationResult.hasErrors ? 'text-red-400' : 
                        validationResult.hasWarnings ? 'text-amber-400' : 'text-green-400'
                      }`}>
                        {validationResult.hasErrors 
                          ? `${validationResult.missingRetail.length + validationResult.missingBoth.length} items blocking export`
                          : validationResult.hasWarnings
                            ? `${validationResult.zeroValue.length + validationResult.missingCost.length} items with warnings`
                            : 'All pricing validated'
                        }
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">
                        {validationResult.metrics.commitmentPricingPct}% commitment pricing • 
                        {validationResult.metrics.fallbackPricingPct}% fallback • 
                        {validationResult.metrics.missingPricingPct}% missing
                      </p>
                    </div>
                  </div>
                  {itemsNeedingPricing.length > 0 && (
                    <Button
                      onClick={recalculatePricing}
                      disabled={recalculatingPricing}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {recalculatingPricing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Recalculate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Preview Toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showPreview"
                checked={showPreview}
                onCheckedChange={setShowPreview}
              />
              <Label htmlFor="showPreview" className="text-sm text-gray-300 cursor-pointer">
                Show export preview
              </Label>
            </div>

            {/* Preview Table */}
            {showPreview && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-0">
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-700">
                          <TableHead className="text-gray-400 text-xs">Product/Service</TableHead>
                          <TableHead className="text-gray-400 text-xs">Description</TableHead>
                          <TableHead className="text-gray-400 text-xs text-center">Qty</TableHead>
                          <TableHead className="text-gray-400 text-xs text-right">Rate</TableHead>
                          <TableHead className="text-gray-400 text-xs text-center">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exportData.slice(0, 20).map((item, idx) => (
                          <TableRow key={idx} className="border-gray-700">
                            <TableCell className="text-white text-sm">Build_Parts</TableCell>
                            <TableCell className="text-gray-300 text-sm max-w-xs truncate">
                              {item.description}
                            </TableCell>
                            <TableCell className="text-white text-sm text-center">{item.qtyNeeded}</TableCell>
                            <TableCell className="text-green-400 text-sm text-right font-mono">
                              ${item.unitRetail.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.needsPricingUpdate ? (
                                <Badge className="bg-red-500/20 text-red-400 text-xs">Missing</Badge>
                              ) : item.pricingSource === 'commitment' ? (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">Commitment</Badge>
                              ) : item.pricingSource === 'override' ? (
                                <Badge className="bg-purple-500/20 text-purple-400 text-xs">Override</Badge>
                              ) : item.pricingSource === 'assignment' ? (
                                <Badge className="bg-blue-500/20 text-blue-400 text-xs">Assignment</Badge>
                              ) : item.pricingSource === 'part_default' ? (
                                <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Part Default</Badge>
                              ) : (
                                <Badge className="bg-gray-500/20 text-gray-400 text-xs">Matrix</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {exportData.length > 20 && (
                      <div className="text-center py-2 text-gray-500 text-sm">
                        ... and {exportData.length - 20} more items
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Export Format Info */}
            <Card className="bg-gray-800/30 border-gray-700">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Export Format</h4>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>• <strong>Product/Service:</strong> "Build_Parts" (static)</p>
                  <p>• <strong>Description:</strong> Category / Part Name / Part Number</p>
                  <p>• <strong>Qty:</strong> Required quantity for this build</p>
                  <p>• <strong>Rate:</strong> Unit retail price</p>
                </div>
                <h4 className="text-sm font-semibold text-white mt-3 mb-2">Pricing Priority (Phase 2F)</h4>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>1. <span className="text-green-400">Commitment</span> - unit_retail_snapshot (authoritative)</p>
                  <p>2. <span className="text-blue-400">Assignment</span> - PartBuildAssignment.unit_retail</p>
                  <p>3. <span className="text-yellow-400">Part Default</span> - Part.default_retail</p>
                  <p>4. <span className="text-red-400">Error</span> - No pricing available</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button
              onClick={handleExportClick}
              disabled={isExporting || exportData.length === 0}
              className="bg-green-700 hover:bg-green-600"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Validate & Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pre-export Validation Modal */}
      <ExportValidationModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        validationResult={validationResult}
        buildName={buildName}
        onExportWithWarnings={exportToQuickBooksWithWarnings}
        onExportClean={exportToQuickBooksClean}
        isExporting={isExporting}
      />
    </>
  );
}