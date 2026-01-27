import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Printer, Download, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [showAllPartsOnPickList, setShowAllPartsOnPickList] = useState(false);
  const [pickListGroupBy, setPickListGroupBy] = useState('location');

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

  // Helper to get location info for a part
  const getLocationInfo = (inv) => {
    const location = locations.find(l => l.id === inv?.location_id);
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

    return { mainLocation, subLocation };
  };

  // Helper to get category info for a part
  const getCategoryInfo = (part) => {
    const category = categories.find(c => c.id === part.part_category_id);
    let mainCategory = 'Uncategorized';
    let subCategory = '';

    if (category) {
      if (category.parent_id) {
        const parent = categories.find(c => c.id === category.parent_id);
        mainCategory = parent?.name || 'Uncategorized';
        subCategory = category.name;
      } else {
        mainCategory = category.name;
      }
    }

    return { mainCategory, subCategory, sortOrder: category?.sort_order || 999 };
  };

  // Generate pick list data
  const generatePickListData = (includeAllParts = false, groupBy = 'location') => {
    const pickItems = [];
    const nonPhysicalItems = [];
    const processedPartIds = new Set();

    // Get all build requirements
    const buildRequirements = requirements.filter(r => r.project_id === buildId);

    buildRequirements.forEach(req => {
      const part = parts.find(p => p.id === req.part_id);
      if (!part) return;

      const partImage = part.featured_photo || (part.photos && part.photos[0]) || null;
      const vendor = vendors.find(v => v.id === part.default_vendor_id);
      const vendorName = vendor?.vendor_name || '';
      const { mainCategory, subCategory, sortOrder } = getCategoryInfo(part);

      // Get inventory items with stock for this part
      const partInventory = inventoryItems.filter(i => 
        i.part_id === part.id && (i.quantity_on_hand || 0) > 0
      );

      const allocatedQty = req.qty_allocated || 0;
      const installedQty = req.qty_installed || 0;
      const neededQty = req.qty_needed || 0;
      const remainingToAllocate = neededQty - allocatedQty - installedQty;

      // Add physical inventory items
      if (allocatedQty > 0) {
        partInventory.forEach(inv => {
          const { mainLocation, subLocation } = getLocationInfo(inv);

          const qtyToPick = Math.min(
            inv.quantity_on_hand || 0,
            allocatedQty - installedQty
          );

          if (qtyToPick > 0) {
            processedPartIds.add(part.id);
            pickItems.push({
              partId: part.id,
              partName: part.part_name,
              partNumber: part.vendor_part_number || '',
              partImage,
              vendorName,
              mainCategory,
              subCategory,
              categorySortOrder: sortOrder,
              qtyToPick,
              mainLocation,
              subLocation,
              locationId: inv.location_id,
              unitCost: inv.purchase_cost || part.default_cost || 0,
              extendedCost: (inv.purchase_cost || part.default_cost || 0) * qtyToPick,
              isReserved: (inv.quantity_reserved || 0) > 0,
              isPhysical: true,
              status: null,
              notes: req.notes || '',
            });
          }
        });
      }

      // Add non-physical items if requested
      if (includeAllParts && remainingToAllocate > 0) {
        // Check if on order
        const partLineItems = lineItems.filter(li => li.part_id === part.id);
        const onOrderQty = partLineItems.reduce((sum, li) => {
          const order = orders.find(o => o.id === li.order_id);
          if (order && ['Ordered', 'Partial'].includes(order.status)) {
            return sum + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0));
          }
          return sum;
        }, 0);

        const status = onOrderQty >= remainingToAllocate ? 'ON ORDER' : 'TO BUY';

        nonPhysicalItems.push({
          partId: part.id,
          partName: part.part_name,
          partNumber: part.vendor_part_number || '',
          partImage,
          vendorName,
          mainCategory,
          subCategory,
          categorySortOrder: sortOrder,
          qtyToPick: remainingToAllocate,
          mainLocation: '',
          subLocation: '',
          locationId: null,
          unitCost: part.default_cost || 0,
          extendedCost: (part.default_cost || 0) * remainingToAllocate,
          isReserved: false,
          isPhysical: false,
          status,
          notes: req.notes || '',
        });
      }
    });

    // Also check build assignments
    const buildAssigns = buildAssignments.filter(ba => ba.project_id === buildId);

    buildAssigns.forEach(ba => {
      if (processedPartIds.has(ba.part_id)) return;

      const part = parts.find(p => p.id === ba.part_id);
      if (!part) return;

      const partImage = part.featured_photo || (part.photos && part.photos[0]) || null;
      const vendor = vendors.find(v => v.id === part.default_vendor_id);
      const vendorName = vendor?.vendor_name || '';
      const { mainCategory, subCategory, sortOrder } = getCategoryInfo(part);
      const reservedQty = ba.qty_reserved || 0;
      const neededQty = ba.qty_needed || 0;

      if (reservedQty > 0) {
        const partInventory = inventoryItems.filter(i => 
          i.part_id === part.id && (i.quantity_on_hand || 0) > 0
        );

        partInventory.forEach(inv => {
          const existing = pickItems.find(pi => 
            pi.partId === part.id && pi.locationId === inv.location_id
          );
          if (existing) return;

          const { mainLocation, subLocation } = getLocationInfo(inv);

          const qtyToPick = Math.min(inv.quantity_on_hand || 0, reservedQty);

          if (qtyToPick > 0) {
            processedPartIds.add(part.id);
            pickItems.push({
              partId: part.id,
              partName: part.part_name,
              partNumber: part.vendor_part_number || '',
              partImage,
              vendorName,
              mainCategory,
              subCategory,
              categorySortOrder: sortOrder,
              qtyToPick,
              mainLocation,
              subLocation,
              locationId: inv.location_id,
              unitCost: inv.purchase_cost || part.default_cost || 0,
              extendedCost: (inv.purchase_cost || part.default_cost || 0) * qtyToPick,
              isReserved: true,
              isPhysical: true,
              status: null,
              notes: ba.notes || '',
            });
          }
        });
      }

      // Add non-physical if requested
      if (includeAllParts && neededQty > reservedQty) {
        const remainingQty = neededQty - reservedQty;
        const status = ba.needed_status === 'On-Order' ? 'ON ORDER' : 'TO BUY';

        nonPhysicalItems.push({
          partId: part.id,
          partName: part.part_name,
          partNumber: part.vendor_part_number || '',
          partImage,
          vendorName,
          mainCategory,
          subCategory,
          categorySortOrder: sortOrder,
          qtyToPick: remainingQty,
          mainLocation: '',
          subLocation: '',
          locationId: null,
          unitCost: part.default_cost || 0,
          extendedCost: (part.default_cost || 0) * remainingQty,
          isReserved: false,
          isPhysical: false,
          status,
          notes: ba.notes || '',
        });
      }
    });

    // Group items based on groupBy parameter
    const grouped = {};

    if (groupBy === 'location') {
      // Group by location
      pickItems.forEach(item => {
        const mainKey = item.mainLocation || 'Unassigned';
        if (!grouped[mainKey]) {
          grouped[mainKey] = { subLocations: {}, sortOrder: 0 };
        }
        const subKey = item.subLocation || '_direct';
        if (!grouped[mainKey].subLocations[subKey]) {
          grouped[mainKey].subLocations[subKey] = [];
        }
        grouped[mainKey].subLocations[subKey].push(item);
      });

      // Add non-physical items as separate group
      if (nonPhysicalItems.length > 0) {
        grouped['NOT IN INVENTORY'] = {
          subLocations: { '_direct': nonPhysicalItems },
          sortOrder: 9999,
          isNonInventory: true
        };
      }
    } else if (groupBy === 'category') {
      // Group by category
      const allItems = [...pickItems, ...nonPhysicalItems];
      
      allItems.forEach(item => {
        const mainKey = item.mainCategory || 'Uncategorized';
        if (!grouped[mainKey]) {
          grouped[mainKey] = { 
            subLocations: {}, 
            sortOrder: item.categorySortOrder,
            isNonInventory: false
          };
        }
        const subKey = item.subCategory || '_direct';
        if (!grouped[mainKey].subLocations[subKey]) {
          grouped[mainKey].subLocations[subKey] = [];
        }
        grouped[mainKey].subLocations[subKey].push(item);
      });
    }

    return { 
      items: [...pickItems, ...nonPhysicalItems], 
      grouped, 
      physicalCount: pickItems.length,
      groupBy 
    };
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
      const { items, grouped, physicalCount, groupBy } = generatePickListData(showAllPartsOnPickList, pickListGroupBy);
      const physicalItems = items.filter(i => i.isPhysical);
      const totalCost = physicalItems.reduce((sum, i) => sum + i.extendedCost, 0);
      const totalPhysicalParts = physicalItems.reduce((sum, i) => sum + i.qtyToPick, 0);
      const isGroupByCategory = groupBy === 'category';

      // Sort groups
      const sortedGroups = Object.entries(grouped).sort((a, b) => {
        // NOT IN INVENTORY always last for location grouping
        if (a[0] === 'NOT IN INVENTORY') return 1;
        if (b[0] === 'NOT IN INVENTORY') return -1;
        // Uncategorized last for category grouping
        if (a[0] === 'Uncategorized') return 1;
        if (b[0] === 'Uncategorized') return -1;
        // Otherwise sort by sortOrder or alphabetically
        const orderA = a[1].sortOrder ?? 0;
        const orderB = b[1].sortOrder ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a[0].localeCompare(b[0]);
      });

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
            .header-info { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 10px; }
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
            .location-header.non-inventory {
              background: #999;
              font-style: italic;
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
              vertical-align: middle;
            }
            .parts-table tr:last-child td { border-bottom: none; }
            .parts-table tr.non-physical td {
              color: #888;
              font-style: italic;
            }
            .part-cell {
              display: flex;
              align-items: flex-start;
              gap: 10px;
            }
            .part-thumb {
              width: 40px;
              height: 40px;
              object-fit: cover;
              border-radius: 4px;
              border: 1px solid #ddd;
              flex-shrink: 0;
            }
            .part-thumb-placeholder {
              width: 40px;
              height: 40px;
              background: #f0f0f0;
              border-radius: 4px;
              border: 1px solid #ddd;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .part-thumb-placeholder svg {
              width: 20px;
              height: 20px;
              fill: #999;
            }
            .part-info { flex: 1; min-width: 0; }
            .part-name { font-weight: bold; font-size: 14px; }
            .part-meta { font-size: 11px; color: #666; margin-top: 2px; }
            .part-meta span { margin-right: 12px; }
            .part-number { font-family: monospace; }
            .part-vendor { font-style: italic; }
            .part-location { color: #444; }
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
            .checkbox.disabled {
              border-color: #ccc;
              background: #f5f5f5;
            }
            .cost { 
              text-align: right; 
              font-size: 12px; 
              color: #666; 
            }
            .badge {
              display: inline-block;
              font-size: 9px;
              padding: 2px 6px;
              border-radius: 3px;
              margin-left: 8px;
              font-weight: bold;
            }
            .reserved-badge {
              background: #333;
              color: #fff;
            }
            .status-badge {
              background: #f0f0f0;
              color: #666;
              border: 1px solid #ccc;
            }
            .status-badge.on-order {
              background: #e3f2fd;
              color: #1565c0;
              border-color: #90caf9;
            }
            .status-badge.to-buy {
              background: #fff3e0;
              color: #e65100;
              border-color: #ffcc80;
            }
            .status-badge.in-stock {
              background: #e8f5e9;
              color: #2e7d32;
              border-color: #81c784;
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
              <div><strong>Parts to Pick:</strong> ${totalPhysicalParts}</div>
              <div><strong>Grouped By:</strong> ${isGroupByCategory ? 'Category' : 'Location'}</div>
              ${showAllPartsOnPickList ? `<div><strong>Mode:</strong> All Parts (incl. non-physical)</div>` : ''}
            </div>
          </div>

          ${sortedGroups.map(([mainKey, data]) => {
            const isNonInventory = mainKey === 'NOT IN INVENTORY' || data.isNonInventory;
            
            // Sort sub-groups
            const sortedSubGroups = Object.entries(data.subLocations).sort((a, b) => {
              if (a[0] === '_direct') return -1;
              if (b[0] === '_direct') return 1;
              return a[0].localeCompare(b[0]);
            });

            return `
            <div class="location-group">
              <div class="location-header ${isNonInventory ? 'non-inventory' : ''}">${mainKey}</div>
              ${sortedSubGroups.map(([subKey, items]) => `
                ${subKey !== '_direct' ? `<div class="sub-location-header">→ ${subKey}</div>` : ''}
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
                    ${items.map(item => {
                      const locationDisplay = item.mainLocation 
                        ? (item.subLocation ? `${item.mainLocation} > ${item.subLocation}` : item.mainLocation)
                        : '';
                      
                      return `
                      <tr class="${!item.isPhysical ? 'non-physical' : ''}">
                        <td>
                          ${item.isPhysical 
                            ? '<span class="checkbox"></span>' 
                            : '<span class="checkbox disabled"></span>'
                          }
                        </td>
                        <td>
                          <div class="part-cell">
                            ${item.partImage 
                              ? `<img src="${item.partImage}" class="part-thumb" alt="" />` 
                              : `<div class="part-thumb-placeholder">
                                  <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h12v2H6z"/></svg>
                                </div>`
                            }
                            <div class="part-info">
                              <div class="part-name">
                                ${item.partName}
                                ${item.isPhysical && item.isReserved ? '<span class="badge status-badge in-stock">IN STOCK</span>' : ''}
                                ${item.status ? `<span class="badge status-badge ${item.status === 'ON ORDER' ? 'on-order' : 'to-buy'}">${item.status}</span>` : ''}
                              </div>
                              <div class="part-meta">
                                ${item.partNumber ? `<span class="part-number">${item.partNumber}</span>` : ''}
                                ${item.vendorName ? `<span class="part-vendor">Vendor: ${item.vendorName}</span>` : ''}
                                ${isGroupByCategory && locationDisplay && item.isPhysical ? `<span class="part-location">📍 ${locationDisplay}</span>` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td class="qty">${item.qtyToPick}</td>
                        ${showCostOnPickList ? `<td class="cost">$${item.extendedCost.toFixed(2)}</td>` : ''}
                      </tr>
                    `}).join('')}
                  </tbody>
                </table>
              `).join('')}
            </div>
          `}).join('')}

          <div class="summary">
            <div class="summary-item">
              <div class="summary-label">Parts to Pick (Physical)</div>
              <div class="summary-value">${totalPhysicalParts}</div>
            </div>
            ${showCostOnPickList ? `
              <div class="summary-item">
                <div class="summary-label">Physical Pick Value</div>
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
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-gray-300">Group Pick List By</Label>
                <Select value={pickListGroupBy} onValueChange={setPickListGroupBy}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="location">Location</SelectItem>
                    <SelectItem value="category">Part Category / Subcategory</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-700">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showAllParts"
                    checked={showAllPartsOnPickList}
                    onCheckedChange={setShowAllPartsOnPickList}
                  />
                  <Label htmlFor="showAllParts" className="text-sm text-gray-300 cursor-pointer">
                    Include all build parts (on order / to buy)
                  </Label>
                </div>

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
              </div>
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