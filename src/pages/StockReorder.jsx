import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Package, 
  ShoppingCart, 
  AlertTriangle, 
  Loader2, 
  Check,
  RefreshCw,
  Warehouse,
  TrendingDown
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import PricingBadge from "@/components/parts/PricingBadge";

/**
 * StockReorder - PHASE 15V AK STOCK Ordering System
 * 
 * Shows parts where physical_stock < reorder_point
 * Allows bulk ordering to AK_STOCK system project
 */
export default function StockReorder() {
  const queryClient = useQueryClient();
  const [selectedParts, setSelectedParts] = useState(new Set());
  const [orderQuantities, setOrderQuantities] = useState({});
  const [isCreatingOrders, setIsCreatingOrders] = useState(false);

  // Fetch parts with inventory view
  const { data: partsInventoryView = [], isLoading: loadingInventory } = useQuery({
    queryKey: ['partsInventoryView'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPartsInventoryView', {});
      return res.data?.parts || [];
    },
  });

  const { data: parts = [], isLoading: loadingParts } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  // Find or create AK_STOCK project
  const { data: akStockProject, isLoading: loadingProject } = useQuery({
    queryKey: ['akStockProject'],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({
        is_system_project: true,
        system_project_type: 'AK_STOCK'
      });
      
      if (projects.length > 0) {
        return projects[0];
      }
      
      // Create if doesn't exist
      const newProject = await base44.entities.Project.create({
        name: 'AK STOCK',
        is_system_project: true,
        system_project_type: 'AK_STOCK',
        financial_model_version: 'forward'
      });
      
      return newProject;
    },
  });

  // Build lookup map
  const inventoryMap = useMemo(() => {
    const map = new Map();
    partsInventoryView.forEach(p => map.set(p.part_id, p));
    return map;
  }, [partsInventoryView]);

  // Filter parts that need reorder
  const partsNeedingReorder = useMemo(() => {
    return parts
      .filter(part => {
        if (part.is_archived) return false;
        if (!part.reorder_point || part.reorder_point <= 0) return false;
        
        const inv = inventoryMap.get(part.id);
        const physical = inv?.physical_stock ?? part.physical_stock ?? 0;
        
        return physical < part.reorder_point;
      })
      .map(part => {
        const inv = inventoryMap.get(part.id);
        const physical = inv?.physical_stock ?? part.physical_stock ?? 0;
        const vendor = vendors.find(v => v.id === part.default_vendor_id);
        
        return {
          ...part,
          physical_stock: physical,
          shortage: part.reorder_point - physical,
          suggested_qty: part.reorder_quantity || Math.max(1, part.reorder_point - physical),
          vendor_name: vendor?.vendor_name || 'No Vendor'
        };
      })
      .sort((a, b) => b.shortage - a.shortage); // Most urgent first
  }, [parts, inventoryMap, vendors]);

  // Initialize order quantities with suggested values
  useMemo(() => {
    const newQtys = {};
    partsNeedingReorder.forEach(part => {
      if (orderQuantities[part.id] === undefined) {
        newQtys[part.id] = part.suggested_qty;
      }
    });
    if (Object.keys(newQtys).length > 0) {
      setOrderQuantities(prev => ({ ...prev, ...newQtys }));
    }
  }, [partsNeedingReorder]);

  // Create stock orders mutation
  const createOrdersMutation = useMutation({
    mutationFn: async (selectedPartIds) => {
      if (!akStockProject) {
        throw new Error('AK_STOCK project not found');
      }

      const results = [];
      
      for (const partId of selectedPartIds) {
        const part = parts.find(p => p.id === partId);
        if (!part) continue;

        const qty = orderQuantities[partId] || part.reorder_quantity || 1;

        // Create commitment under AK_STOCK project
        const response = await base44.functions.invoke('executeSupplyAction', {
          action_type: 'ADJUST_REQUIRED',
          payload: {
            project_id: akStockProject.id,
            part_id: partId,
            required_total_set: qty,
            source_type: 'STOCK'
          }
        });

        if (response.data?.error) {
          results.push({ part_id: partId, error: response.data.error });
        } else {
          // Update commitment to not_billable
          if (response.data?.commitment_id) {
            await base44.entities.PartCommitment.update(response.data.commitment_id, {
              billing_status: 'not_billable',
              requires_client_billing: false
            });
          }
          results.push({ part_id: partId, commitment_id: response.data.commitment_id });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => !r.error).length;
      const failed = results.filter(r => r.error).length;
      
      if (successful > 0) {
        toast.success(`Created ${successful} stock order${successful > 1 ? 's' : ''}`);
      }
      if (failed > 0) {
        toast.error(`${failed} order${failed > 1 ? 's' : ''} failed`);
      }
      
      setSelectedParts(new Set());
      queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] });
      queryClient.invalidateQueries({ queryKey: ['commitments'] });
      setIsCreatingOrders(false);
    },
    onError: (error) => {
      toast.error('Failed to create orders: ' + error.message);
      setIsCreatingOrders(false);
    }
  });

  const handleSelectAll = () => {
    if (selectedParts.size === partsNeedingReorder.length) {
      setSelectedParts(new Set());
    } else {
      setSelectedParts(new Set(partsNeedingReorder.map(p => p.id)));
    }
  };

  const handleTogglePart = (partId) => {
    const newSelected = new Set(selectedParts);
    if (newSelected.has(partId)) {
      newSelected.delete(partId);
    } else {
      newSelected.add(partId);
    }
    setSelectedParts(newSelected);
  };

  const handleQuantityChange = (partId, value) => {
    setOrderQuantities(prev => ({
      ...prev,
      [partId]: Math.max(1, parseInt(value) || 1)
    }));
  };

  const handleCreateOrders = () => {
    if (selectedParts.size === 0) {
      toast.error('Select parts to order');
      return;
    }
    setIsCreatingOrders(true);
    createOrdersMutation.mutate(Array.from(selectedParts));
  };

  const isLoading = loadingInventory || loadingParts || loadingProject;

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <Warehouse className="w-8 h-8 text-blue-400" />
                Stock Reorder
              </h1>
              <p className="text-gray-400 mt-1">
                Parts below reorder point • Orders go to AK_STOCK project
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries()}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gray-900/50 border-red-900/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-8 h-8 text-red-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">{partsNeedingReorder.length}</p>
                    <p className="text-xs text-gray-400">Parts Below Reorder</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gray-900/50 border-blue-900/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-8 h-8 text-blue-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">{selectedParts.size}</p>
                    <p className="text-xs text-gray-400">Selected to Order</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-green-900/30 col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">AK_STOCK Project</p>
                    <p className="text-white font-medium">
                      {akStockProject ? akStockProject.name : 'Loading...'}
                    </p>
                  </div>
                  <Badge className="bg-blue-600">System Project</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Parts Table */}
          <Card className="bg-gray-900/50 border-red-900/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Parts Needing Restock</CardTitle>
              <Button
                onClick={handleCreateOrders}
                disabled={selectedParts.size === 0 || isCreatingOrders}
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                {isCreatingOrders ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShoppingCart className="w-4 h-4" />
                )}
                Create Stock Orders ({selectedParts.size})
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : partsNeedingReorder.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Check className="w-12 h-12 mx-auto mb-4 text-green-400" />
                  <p className="text-lg">All parts are adequately stocked!</p>
                  <p className="text-sm mt-2">No parts below their reorder point</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800">
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedParts.size === partsNeedingReorder.length}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400 text-center">On Hand</TableHead>
                        <TableHead className="text-gray-400 text-center">Reorder Pt</TableHead>
                        <TableHead className="text-gray-400 text-center">Shortage</TableHead>
                        <TableHead className="text-gray-400 text-center">Pricing</TableHead>
                        <TableHead className="text-gray-400">Vendor</TableHead>
                        <TableHead className="text-gray-400 text-center w-24">Order Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partsNeedingReorder.map((part) => (
                        <TableRow 
                          key={part.id} 
                          className={cn(
                            "border-gray-800 hover:bg-gray-800/50",
                            selectedParts.has(part.id) && "bg-blue-900/20"
                          )}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedParts.has(part.id)}
                              onCheckedChange={() => handleTogglePart(part.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-white font-medium line-clamp-1">
                                {part.part_name}
                              </p>
                              {part.vendor_part_number && (
                                <p className="text-xs text-gray-400 font-mono">
                                  {part.vendor_part_number}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn(
                              "font-semibold",
                              part.physical_stock <= 0 ? "text-red-400" : "text-white"
                            )}>
                              {part.physical_stock}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-gray-400">
                            {part.reorder_point}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-red-600 text-white">
                              -{part.shortage}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <PricingBadge part={part} size="xs" />
                          </TableCell>
                          <TableCell className="text-gray-300">
                            {part.vendor_name}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={orderQuantities[part.id] || part.suggested_qty}
                              onChange={(e) => handleQuantityChange(part.id, e.target.value)}
                              className="w-20 text-center bg-gray-800 border-gray-700"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="bg-blue-900/20 border-blue-700/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-200">
                  <p className="font-medium mb-1">How Stock Reorder Works:</p>
                  <ul className="list-disc list-inside text-blue-300/80 space-y-1">
                    <li>Orders are created as commitments under the AK_STOCK system project</li>
                    <li>These commitments have <code className="bg-blue-800/50 px-1 rounded">billing_status = not_billable</code></li>
                    <li>Use the standard CREATE_PO workflow to order from vendors</li>
                    <li>Received stock flows through normal rebalancing</li>
                    <li>AK_STOCK is excluded from client dashboards and invoicing</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}