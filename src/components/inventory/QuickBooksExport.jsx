import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  DollarSign,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

/**
 * Helper function to get markup from matrix
 */
export function getMarkupFromMatrix(defaultCost, matrixTiers) {
  const activeTiers = matrixTiers
    .filter(t => t.active !== false)
    .sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0));
  
  return activeTiers.find(t => 
    defaultCost >= (t.min_cost || 0) && 
    (t.max_cost === null || t.max_cost === undefined || defaultCost < t.max_cost)
  );
}

/**
 * Helper function to calculate unit retail
 */
export function calculateUnitRetail(defaultCost, matrixRow) {
  if (!matrixRow || !defaultCost) return 0;
  return Math.round(defaultCost * (1 + (matrixRow.markup_pct || 0)) * 100) / 100;
}

/**
 * QuickBooksExport - Component for exporting build parts to QuickBooks CSV format
 */
export default function QuickBooksExport({ buildId, buildName, clientName }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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

  // Generate export data from build assignments
  const exportData = useMemo(() => {
    const items = [];
    const processedPartIds = new Set();

    // Get parts from requirements
    const buildRequirements = requirements.filter(r => r.project_id === buildId);
    buildRequirements.forEach(req => {
      if (processedPartIds.has(req.part_id)) return;
      processedPartIds.add(req.part_id);

      const part = parts.find(p => p.id === req.part_id);
      if (!part) return;

      const qtyNeeded = req.qty_needed || 0;
      if (qtyNeeded <= 0) return;

      // Get the build assignment for this part if it exists (for pricing)
      const assignment = buildAssignments.find(ba => 
        ba.part_id === req.part_id && ba.project_id === buildId
      );

      // Determine pricing
      let unitRetail = 0;
      let pricingSource = 'matrix';
      let appliedMarkup = 0;
      let needsPricingUpdate = false;

      if (assignment?.pricing_locked && assignment?.unit_retail_override) {
        // Use override
        unitRetail = assignment.unit_retail_override;
        pricingSource = 'override';
        appliedMarkup = assignment.applied_markup_pct || 0;
      } else if (assignment?.unit_retail && assignment?.pricing_source === 'matrix') {
        // Use stored calculated value
        unitRetail = assignment.unit_retail;
        pricingSource = 'matrix';
        appliedMarkup = assignment.applied_markup_pct || 0;
      } else {
        // Calculate from matrix
        const cost = assignment?.default_cost || part.default_cost || 0;
        const tier = getMarkupFromMatrix(cost, matrixTiers);
        if (tier) {
          unitRetail = calculateUnitRetail(cost, tier);
          appliedMarkup = tier.markup_pct || 0;
          needsPricingUpdate = true;
        }
        pricingSource = 'calculated';
      }

      const category = getCategoryName(part);
      const description = `${category} / ${part.part_name} / ${part.vendor_part_number || 'N/A'}`;

      items.push({
        partId: part.id,
        requirementId: req.id,
        assignmentId: assignment?.id,
        partName: part.part_name,
        partNumber: part.vendor_part_number || '',
        category,
        description,
        qtyNeeded,
        defaultCost: assignment?.default_cost || part.default_cost || 0,
        unitRetail,
        pricingSource,
        appliedMarkup,
        pricingLocked: assignment?.pricing_locked || false,
        needsPricingUpdate
      });
    });

    // Also check build assignments without requirements
    const buildAssigns = buildAssignments.filter(ba => ba.project_id === buildId);
    buildAssigns.forEach(ba => {
      if (processedPartIds.has(ba.part_id)) return;
      processedPartIds.add(ba.part_id);

      const part = parts.find(p => p.id === ba.part_id);
      if (!part) return;

      const qtyNeeded = ba.qty_needed || 0;
      if (qtyNeeded <= 0) return;

      // Determine pricing
      let unitRetail = 0;
      let pricingSource = 'matrix';
      let appliedMarkup = 0;
      let needsPricingUpdate = false;

      if (ba.pricing_locked && ba.unit_retail_override) {
        unitRetail = ba.unit_retail_override;
        pricingSource = 'override';
        appliedMarkup = ba.applied_markup_pct || 0;
      } else if (ba.unit_retail && ba.pricing_source === 'matrix') {
        unitRetail = ba.unit_retail;
        pricingSource = 'matrix';
        appliedMarkup = ba.applied_markup_pct || 0;
      } else {
        const cost = ba.default_cost || part.default_cost || 0;
        const tier = getMarkupFromMatrix(cost, matrixTiers);
        if (tier) {
          unitRetail = calculateUnitRetail(cost, tier);
          appliedMarkup = tier.markup_pct || 0;
          needsPricingUpdate = true;
        }
        pricingSource = 'calculated';
      }

      const category = getCategoryName(part);
      const description = `${category} / ${part.part_name} / ${part.vendor_part_number || 'N/A'}`;

      items.push({
        partId: part.id,
        requirementId: null,
        assignmentId: ba.id,
        partName: part.part_name,
        partNumber: part.vendor_part_number || '',
        category,
        description,
        qtyNeeded,
        defaultCost: ba.default_cost || part.default_cost || 0,
        unitRetail,
        pricingSource,
        appliedMarkup,
        pricingLocked: ba.pricing_locked || false,
        needsPricingUpdate
      });
    });

    return items;
  }, [buildId, parts, categories, requirements, buildAssignments, matrixTiers]);

  const itemsNeedingPricing = exportData.filter(d => d.needsPricingUpdate);
  const totalRetail = exportData.reduce((sum, d) => sum + (d.unitRetail * d.qtyNeeded), 0);

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

  // Export to QuickBooks CSV
  const exportToQuickBooks = () => {
    setIsExporting(true);
    try {
      // QuickBooks CSV headers - only 4 fields
      const headers = ['Product/Service', 'Description', 'Qty', 'Rate'];

      const rows = exportData
        .filter(item => item.qtyNeeded > 0)
        .map(item => [
          'Build_Parts',
          item.description,
          item.qtyNeeded,
          item.unitRetail.toFixed(2)
        ]);

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

      toast.success('QuickBooks CSV exported successfully');
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

            {/* Pricing Warning */}
            {itemsNeedingPricing.length > 0 && (
              <Card className="bg-amber-900/20 border-amber-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-amber-400">
                          {itemsNeedingPricing.length} items need pricing calculation
                        </h3>
                        <p className="text-sm text-amber-300 mt-1">
                          These items don't have stored unit_retail values. Click to calculate and save using the markup matrix.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={recalculatePricing}
                      disabled={recalculatingPricing}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {recalculatingPricing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Calculate & Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

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
                              {item.pricingLocked ? (
                                <Badge className="bg-purple-500/20 text-purple-400 text-xs">Override</Badge>
                              ) : item.needsPricingUpdate ? (
                                <Badge className="bg-amber-500/20 text-amber-400 text-xs">Calc</Badge>
                              ) : (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">Matrix</Badge>
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
                  <p>• <strong>Rate:</strong> Unit retail price (from markup matrix)</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="border-gray-700">
              Cancel
            </Button>
            <Button
              onClick={exportToQuickBooks}
              disabled={isExporting || exportData.length === 0}
              className="bg-green-700 hover:bg-green-600"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export to QuickBooks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}