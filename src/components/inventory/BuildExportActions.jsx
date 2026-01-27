import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Printer, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * BuildExportActions - Shared component for exporting build parts and printing pick lists
 * 
 * Props:
 * - buildId: The project/build ID
 * - buildName: Display name for the build
 * - clientName: Optional client name
 * - trigger: Optional custom trigger element
 */
export default function BuildExportActions({ buildId, buildName, clientName, trigger }) {
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showPickListDialog, setShowPickListDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showCostOnPickList, setShowCostOnPickList] = useState(false);

  // Fetch all required data
  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list(),
  });

  const { data: buildAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list(),
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts'],
    queryFn: () => base44.entities.InstalledPart.list(),
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list(),
  });

  // Generate build parts data
  const generateBuildPartsData = () => {
    const buildParts = [];
    const processedPartIds = new Set();

    // Get parts from requirements
    const buildRequirements = requirements.filter(r => r.project_id === buildId);
    buildRequirements.forEach(req => {
      if (processedPartIds.has(req.part_id)) return;
      processedPartIds.add(req.part_id);

      const part = parts.find(p => p.id === req.part_id);
      if (!part) return;

      const partData = calculatePartData(part, req);
      buildParts.push(partData);
    });

    // Get parts from build assignments
    const buildAssigns = buildAssignments.filter(ba => ba.project_id === buildId);
    buildAssigns.forEach(ba => {
      if (processedPartIds.has(ba.part_id)) return;
      processedPartIds.add(ba.part_id);

      const part = parts.find(p => p.id === ba.part_id);
      if (!part) return;

      const partData = calculatePartData(part, null, ba);
      buildParts.push(partData);
    });

    return buildParts;
  };

  const calculatePartData = (part, requirement = null, assignment = null) => {
    const category = categories.find(c => c.id === part.part_category_id);
    const vendor = vendors.find(v => v.id === part.default_vendor_id);
    
    // Get inventory for this part
    const partInventory = inventoryItems.filter(i => i.part_id === part.id);
    const inStockQty = partInventory.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
    const avgCost = partInventory.length > 0 
      ? partInventory.reduce((sum, i) => sum + (i.purchase_cost || 0), 0) / partInventory.length
      : part.default_cost || 0;

    // Get installed qty for this build
    const buildInstalled = installedParts.filter(ip => 
      ip.part_id === part.id && ip.project_id === buildId
    );
    const installedQty = buildInstalled.reduce((sum, ip) => sum + (ip.qty_consumed || 0), 0);

    // Get on-order qty
    const partLineItems = lineItems.filter(li => li.part_id === part.id);
    const onOrderQty = partLineItems.reduce((sum, li) => {
      const order = orders.find(o => o.id === li.order_id);
      if (order && ['Ordered', 'Partial'].includes(order.status)) {
        return sum + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
      }
      return sum;
    }, 0);

    // Calculate quantities based on requirement or assignment
    let requiredQty = 0;
    let allocatedQty = 0;

    if (requirement) {
      requiredQty = requirement.qty_needed || 0;
      allocatedQty = requirement.qty_allocated || 0;
    } else if (assignment) {
      requiredQty = assignment.qty_needed || 0;
      allocatedQty = assignment.qty_reserved || 0;
    }

    const toBuyQty = Math.max(0, requiredQty - allocatedQty - installedQty - onOrderQty);

    // Determine status
    let status = 'To Buy';
    if (installedQty >= requiredQty) {
      status = 'Installed';
    } else if (allocatedQty >= (requiredQty - installedQty)) {
      status = 'In Stock';
    } else if (onOrderQty > 0) {
      status = allocatedQty > 0 ? 'Partial' : 'Ordered';
    } else if (allocatedQty > 0) {
      status = 'Partial';
    }

    // Determine cost source
    let costSource = 'Default';
    if (partInventory.some(i => i.purchase_cost > 0)) {
      costSource = 'Inventory';
    } else if (vendor) {
      costSource = 'Supplier';
    }

    const unitCost = avgCost || part.default_cost || 0;
    const unitRetail = part.default_retail || 0;

    return {
      buildName,
      clientName: clientName || '',
      partName: part.part_name,
      partNumber: part.vendor_part_number || '',
      category: category?.name || '',
      requiredQty,
      allocatedQty,
      installedQty,
      inStockQty,
      onOrderQty,
      toBuyQty,
      unitCost,
      extendedCost: unitCost * requiredQty,
      unitRetail,
      extendedRetail: unitRetail * requiredQty,
      costSource,
      status,
      supplier: vendor?.vendor_name || '',
      notes: requirement?.notes || assignment?.notes || '',
    };
  };

  // Generate pick list data (only physically present, reserved, not installed)
  const generatePickListData = () => {
    const pickItems = [];
    const processedPartIds = new Set();

    // Get parts from requirements with allocations
    const buildRequirements = requirements.filter(r => 
      r.project_id === buildId && (r.qty_allocated || 0) > 0
    );

    buildRequirements.forEach(req => {
      const part = parts.find(p => p.id === req.part_id);
      if (!part) return;

      // Get inventory items with reserved qty for this part
      const partInventory = inventoryItems.filter(i => 
        i.part_id === part.id && (i.quantity_on_hand || 0) > 0
      );

      partInventory.forEach(inv => {
        const location = locations.find(l => l.id === inv.location_id);
        let mainLocation = '';
        let subLocation = '';

        if (location) {
          if (location.parent_id) {
            const parent = locations.find(l => l.id === location.parent_id);
            mainLocation = parent?.location_area || '';
            subLocation = location.location_area;
          } else {
            mainLocation = location.location_area;
          }
        } else {
          mainLocation = 'Unassigned';
        }

        // Calculate qty to pick from this location
        const qtyToPick = Math.min(
          inv.quantity_on_hand || 0,
          req.qty_allocated - (req.qty_installed || 0)
        );

        if (qtyToPick > 0) {
          pickItems.push({
            partId: part.id,
            partName: part.part_name,
            partNumber: part.vendor_part_number || '',
            qtyToPick,
            mainLocation,
            subLocation,
            locationId: inv.location_id,
            unitCost: inv.purchase_cost || part.default_cost || 0,
            extendedCost: (inv.purchase_cost || part.default_cost || 0) * qtyToPick,
            isReserved: (inv.quantity_reserved || 0) > 0,
            notes: req.notes || '',
          });
        }
      });
    });

    // Also check build assignments
    const buildAssigns = buildAssignments.filter(ba => 
      ba.project_id === buildId && (ba.qty_reserved || 0) > 0
    );

    buildAssigns.forEach(ba => {
      const part = parts.find(p => p.id === ba.part_id);
      if (!part) return;

      const partInventory = inventoryItems.filter(i => 
        i.part_id === part.id && (i.quantity_on_hand || 0) > 0
      );

      partInventory.forEach(inv => {
        // Check if already added from requirements
        const existing = pickItems.find(pi => 
          pi.partId === part.id && pi.locationId === inv.location_id
        );
        if (existing) return;

        const location = locations.find(l => l.id === inv.location_id);
        let mainLocation = '';
        let subLocation = '';

        if (location) {
          if (location.parent_id) {
            const parent = locations.find(l => l.id === location.parent_id);
            mainLocation = parent?.location_area || '';
            subLocation = location.location_area;
          } else {
            mainLocation = location.location_area;
          }
        } else {
          mainLocation = 'Unassigned';
        }

        const qtyToPick = Math.min(
          inv.quantity_on_hand || 0,
          ba.qty_reserved || 0
        );

        if (qtyToPick > 0) {
          pickItems.push({
            partId: part.id,
            partName: part.part_name,
            partNumber: part.vendor_part_number || '',
            qtyToPick,
            mainLocation,
            subLocation,
            locationId: inv.location_id,
            unitCost: inv.purchase_cost || part.default_cost || 0,
            extendedCost: (inv.purchase_cost || part.default_cost || 0) * qtyToPick,
            isReserved: true,
            notes: ba.notes || '',
          });
        }
      });
    });

    // Group by location
    const grouped = {};
    pickItems.forEach(item => {
      const mainKey = item.mainLocation || 'Unassigned';
      if (!grouped[mainKey]) {
        grouped[mainKey] = { subLocations: {} };
      }
      const subKey = item.subLocation || '_direct';
      if (!grouped[mainKey].subLocations[subKey]) {
        grouped[mainKey].subLocations[subKey] = [];
      }
      grouped[mainKey].subLocations[subKey].push(item);
    });

    return { items: pickItems, grouped };
  };

  // Export to CSV
  const exportToCSV = () => {
    setIsExporting(true);
    try {
      const data = generateBuildPartsData();
      
      const headers = [
        'Build Name', 'Client Name', 'Part Name', 'Part Number', 'Category',
        'Required Qty', 'Allocated Qty', 'Installed Qty', 'In-Stock Qty', 'On-Order Qty', 'To-Buy Qty',
        'Unit Cost', 'Extended Cost', 'Unit Retail', 'Extended Retail',
        'Cost Source', 'Status', 'Supplier', 'Notes'
      ];

      const rows = data.map(row => [
        row.buildName,
        row.clientName,
        row.partName,
        row.partNumber,
        row.category,
        row.requiredQty,
        row.allocatedQty,
        row.installedQty,
        row.inStockQty,
        row.onOrderQty,
        row.toBuyQty,
        row.unitCost.toFixed(2),
        row.extendedCost.toFixed(2),
        row.unitRetail.toFixed(2),
        row.extendedRetail.toFixed(2),
        row.costSource,
        row.status,
        row.supplier,
        row.notes
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${buildName.replace(/[^a-z0-9]/gi, '_')}_parts_export.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('CSV exported successfully');
      setShowExportDialog(false);
    } catch (error) {
      toast.error('Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  // Print pick list
  const printPickList = () => {
    setIsPrinting(true);
    try {
      const { items, grouped } = generatePickListData();
      const totalCost = items.reduce((sum, i) => sum + i.extendedCost, 0);
      const totalParts = items.reduce((sum, i) => sum + i.qtyToPick, 0);

      // Generate print-friendly HTML
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Pick List - ${buildName}</title>
          <style>
            * { box-sizing: border-box; }
            body { 
              font-family: Arial, sans-serif; 
              font-size: 14px; 
              line-height: 1.4;
              margin: 0;
              padding: 20px;
              color: #000;
            }
            .header { 
              border-bottom: 2px solid #000; 
              padding-bottom: 15px; 
              margin-bottom: 20px; 
            }
            .header h1 { margin: 0 0 5px 0; font-size: 24px; }
            .header-info { display: flex; gap: 30px; margin-top: 10px; }
            .header-info div { font-size: 12px; }
            .header-info strong { font-weight: bold; }
            .location-group { margin-bottom: 25px; page-break-inside: avoid; }
            .location-header { 
              background: #333; 
              color: #fff; 
              padding: 8px 12px; 
              font-weight: bold; 
              font-size: 16px;
              margin-bottom: 2px;
            }
            .sub-location-header { 
              background: #666; 
              color: #fff; 
              padding: 5px 12px 5px 24px; 
              font-size: 13px;
              margin-bottom: 2px;
            }
            .parts-table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 10px;
            }
            .parts-table th { 
              text-align: left; 
              padding: 8px 12px; 
              border-bottom: 1px solid #999;
              font-size: 11px;
              text-transform: uppercase;
              color: #666;
            }
            .parts-table td { 
              padding: 10px 12px; 
              border-bottom: 1px solid #ddd;
              vertical-align: top;
            }
            .parts-table tr:last-child td { border-bottom: none; }
            .part-name { font-weight: bold; font-size: 15px; }
            .part-number { font-size: 12px; color: #666; font-family: monospace; }
            .qty { 
              font-size: 20px; 
              font-weight: bold; 
              text-align: center;
              min-width: 50px;
            }
            .checkbox { 
              width: 24px; 
              height: 24px; 
              border: 2px solid #000; 
              display: inline-block;
              vertical-align: middle;
            }
            .cost { 
              text-align: right; 
              font-size: 12px; 
              color: #666; 
            }
            .reserved-badge {
              display: inline-block;
              background: #333;
              color: #fff;
              font-size: 10px;
              padding: 2px 6px;
              border-radius: 3px;
              margin-left: 8px;
            }
            .summary { 
              margin-top: 30px; 
              padding-top: 15px; 
              border-top: 2px solid #000;
              display: flex;
              justify-content: space-between;
            }
            .summary-item { text-align: right; }
            .summary-label { font-size: 12px; color: #666; }
            .summary-value { font-size: 18px; font-weight: bold; }
            .footer { 
              margin-top: 40px; 
              padding-top: 15px;
              border-top: 1px solid #ccc;
              font-size: 11px;
              color: #666;
            }
            @media print {
              body { padding: 0; }
              .location-group { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PICK LIST</h1>
            <div class="header-info">
              <div><strong>Build:</strong> ${buildName}</div>
              ${clientName ? `<div><strong>Client:</strong> ${clientName}</div>` : ''}
              <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
              <div><strong>Total Parts:</strong> ${totalParts}</div>
            </div>
          </div>

          ${Object.entries(grouped).map(([mainLoc, data]) => `
            <div class="location-group">
              <div class="location-header">${mainLoc}</div>
              ${Object.entries(data.subLocations).map(([subLoc, items]) => `
                ${subLoc !== '_direct' ? `<div class="sub-location-header">→ ${subLoc}</div>` : ''}
                <table class="parts-table">
                  <thead>
                    <tr>
                      <th style="width: 30px;"></th>
                      <th>Part</th>
                      <th style="width: 80px; text-align: center;">Qty</th>
                      ${showCostOnPickList ? '<th style="width: 100px; text-align: right;">Cost</th>' : ''}
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map(item => `
                      <tr>
                        <td><span class="checkbox"></span></td>
                        <td>
                          <div class="part-name">
                            ${item.partName}
                            ${item.isReserved ? '<span class="reserved-badge">RSV</span>' : ''}
                          </div>
                          ${item.partNumber ? `<div class="part-number">${item.partNumber}</div>` : ''}
                        </td>
                        <td class="qty">${item.qtyToPick}</td>
                        ${showCostOnPickList ? `<td class="cost">$${item.extendedCost.toFixed(2)}</td>` : ''}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `).join('')}
            </div>
          `).join('')}

          <div class="summary">
            <div class="summary-item">
              <div class="summary-label">Total Parts to Pick</div>
              <div class="summary-value">${totalParts}</div>
            </div>
            ${showCostOnPickList ? `
              <div class="summary-item">
                <div class="summary-label">Total Pick Value</div>
                <div class="summary-value">$${totalCost.toFixed(2)}</div>
              </div>
            ` : ''}
          </div>

          <div class="footer">
            Generated: ${new Date().toLocaleString()} | Build: ${buildName}
          </div>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };

      setShowPickListDialog(false);
      toast.success('Pick list opened for printing');
    } catch (error) {
      toast.error('Failed to generate pick list');
    } finally {
      setIsPrinting(false);
    }
  };

  if (!buildId) return null;

  return (
    <>
      {trigger ? (
        <div onClick={() => setShowExportDialog(true)}>{trigger}</div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowExportDialog(true)}
            className="border-gray-700 text-gray-300 hover:text-white"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Parts
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPickListDialog(true)}
            className="border-gray-700 text-gray-300 hover:text-white"
          >
            <Printer className="w-4 h-4 mr-2" />
            Pick List
          </Button>
        </div>
      )}

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Export Build Parts</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-400">
              Export all parts for <strong className="text-white">{buildName}</strong> including
              quantities, costs, and pricing information.
            </p>

            <div className="space-y-2">
              <Button
                onClick={exportToCSV}
                disabled={isExporting}
                className="w-full bg-green-700 hover:bg-green-600"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Export as CSV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pick List Dialog */}
      <Dialog open={showPickListDialog} onOpenChange={setShowPickListDialog}>
        <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Print Pick List</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-400">
              Generate a printable pick list for <strong className="text-white">{buildName}</strong>.
              Shows parts grouped by storage location.
            </p>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="showCost"
                checked={showCostOnPickList}
                onCheckedChange={setShowCostOnPickList}
              />
              <Label htmlFor="showCost" className="text-sm text-gray-300 cursor-pointer">
                Show cost values on pick list
              </Label>
            </div>

            <Button
              onClick={printPickList}
              disabled={isPrinting}
              className="w-full bg-blue-700 hover:bg-blue-600"
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-2" />
              )}
              Print Pick List
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}