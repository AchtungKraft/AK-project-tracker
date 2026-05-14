import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  AlertTriangle,
  Loader2,
  Check,
  RefreshCw,
  Warehouse,
  TrendingDown,
  Truck,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * StockReorder — INVENTORY PLANNING DASHBOARD (Read-Only)
 *
 * Purpose: View reorder risk, review replenishment state, vendor opportunities.
 * NOT procurement execution — all ordering flows through GlobalNeedToOrder.
 */
export default function StockReorder() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('risk');
  const [syncing, setSyncing] = useState(false);

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
    queryFn: () => base44.entities.Part.list('-updated_date', 500),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  // Fetch AK_STOCK commitments
  const { data: akStockProject } = useQuery({
    queryKey: ['akStockProject'],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({
        is_system_project: true,
        system_project_type: 'AK_STOCK',
      });
      return projects[0] || null;
    },
  });

  const { data: stockCommitments = [] } = useQuery({
    queryKey: ['stockCommitments', akStockProject?.id],
    queryFn: () => base44.entities.PartCommitment.filter({
      project_id: akStockProject.id,
      commitment_status: { $ne: 'cancelled' },
    }),
    enabled: !!akStockProject?.id,
  });

  // Build lookup map
  const inventoryMap = useMemo(() => {
    const map = new Map();
    partsInventoryView.forEach(p => map.set(p.part_id, p));
    return map;
  }, [partsInventoryView]);

  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  // Parts below reorder point
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
        const vendor = vendorMap.get(part.default_vendor_id);
        const commitment = stockCommitments.find(c => c.part_id === part.id);
        return {
          ...part,
          physical_stock: physical,
          shortage: part.reorder_point - physical,
          vendor_name: vendor?.vendor_name || 'No Vendor',
          has_replenishment: !!commitment,
          replenishment_qty: commitment?.required_total || 0,
          replenishment_status: commitment?.commitment_status || null,
          demand_source: commitment?.demand_source || null,
          covered_from_po: commitment?.covered_from_po || 0,
        };
      })
      .sort((a, b) => b.shortage - a.shortage);
  }, [parts, inventoryMap, vendorMap, stockCommitments]);

  // Open replenishment commitments
  const openReplenishments = useMemo(() => {
    return stockCommitments
      .filter(c => c.commitment_status !== 'closed' && (c.required_total || 0) > 0)
      .map(c => {
        const part = parts.find(p => p.id === c.part_id);
        const vendor = part?.default_vendor_id ? vendorMap.get(part.default_vendor_id) : null;
        return {
          ...c,
          part_name: part?.part_name || 'Unknown',
          vendor_name: vendor?.vendor_name || 'No Vendor',
          physical_stock: part?.physical_stock || 0,
          reorder_point: part?.reorder_point || 0,
        };
      });
  }, [stockCommitments, parts, vendorMap]);

  const autoReplenishments = openReplenishments.filter(c => c.demand_source === 'STOCK_REPLENISHMENT');
  const manualOrders = openReplenishments.filter(c => c.demand_source === 'STOCK_MANUAL');

  // Run sync
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncStockReplenishment', { dry_run: false });
      if (res.data?.success) {
        toast.success(`Sync complete: ${res.data.upserted} updated, ${res.data.closed} closed`);
        queryClient.invalidateQueries({ queryKey: ['stockCommitments'] });
        queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] });
      } else {
        toast.error('Sync failed: ' + (res.data?.error || 'Unknown'));
      }
    } catch (err) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const isLoading = loadingInventory || loadingParts;

  const tabs = [
    { id: 'risk', label: 'Reorder Risk', count: partsNeedingReorder.length },
    { id: 'replenishment', label: 'Open Replenishment', count: openReplenishments.length },
    { id: 'manual', label: 'Manual Orders', count: manualOrders.length },
  ];

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <Warehouse className="w-7 h-7 text-blue-400" />
                Inventory Planning
              </h1>
              <p className="text-gray-400 mt-1 text-sm">
                Reorder intelligence · All procurement routes through{' '}
                <Link to={createPageUrl('GlobalNeedToOrder')} className="text-blue-400 hover:underline">Order Queue</Link>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSync}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="border-blue-700 text-blue-300 gap-2"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync Replenishment
              </Button>
              <Link to={createPageUrl('GlobalNeedToOrder')}>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Order Queue
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-black/40 border-red-900/30">
              <CardContent className="p-3 text-center">
                <TrendingDown className="w-6 h-6 mx-auto mb-1 text-red-400" />
                <p className="text-2xl font-bold text-white">{partsNeedingReorder.length}</p>
                <p className="text-xs text-gray-400">Below Reorder Point</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-blue-900/30">
              <CardContent className="p-3 text-center">
                <Truck className="w-6 h-6 mx-auto mb-1 text-blue-400" />
                <p className="text-2xl font-bold text-white">{autoReplenishments.length}</p>
                <p className="text-xs text-gray-400">Auto Replenishment</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-green-900/30">
              <CardContent className="p-3 text-center">
                <Package className="w-6 h-6 mx-auto mb-1 text-green-400" />
                <p className="text-2xl font-bold text-white">{manualOrders.length}</p>
                <p className="text-xs text-gray-400">Manual Stock Orders</p>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-3 text-center">
                <Check className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
                <p className="text-2xl font-bold text-white">
                  {partsNeedingReorder.filter(p => p.has_replenishment).length}
                </p>
                <p className="text-xs text-gray-400">Covered by Commitment</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700 w-fit">
            {tabs.map(tab => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "gap-1.5 h-8 text-xs",
                  activeTab === tab.id ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                {tab.label}
                <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-gray-600">
                  {tab.count}
                </Badge>
              </Button>
            ))}
          </div>

          {/* Content */}
          {isLoading ? (
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-8 text-center">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-500" />
              </CardContent>
            </Card>
          ) : activeTab === 'risk' ? (
            <ReorderRiskTable parts={partsNeedingReorder} />
          ) : activeTab === 'replenishment' ? (
            <ReplenishmentTable commitments={autoReplenishments} />
          ) : (
            <ManualOrdersTable commitments={manualOrders} />
          )}

          {/* Info */}
          <Card className="bg-blue-900/10 border-blue-700/20">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-300/80">
                  <p className="font-medium text-blue-200 mb-0.5">Unified Procurement</p>
                  <p>Stock replenishment and project demand are unified. All ordering flows through the Global Procurement Queue.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}

function ReorderRiskTable({ parts }) {
  if (parts.length === 0) {
    return (
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-8 text-center">
          <Check className="w-10 h-10 mx-auto mb-2 text-green-400" />
          <p className="text-gray-400">All parts adequately stocked</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="bg-black/40 border-gray-800">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800">
                <TableHead className="text-gray-400">Part</TableHead>
                <TableHead className="text-gray-400 text-center">On Hand</TableHead>
                <TableHead className="text-gray-400 text-center">Reorder Pt</TableHead>
                <TableHead className="text-gray-400 text-center">Gap</TableHead>
                <TableHead className="text-gray-400">Vendor</TableHead>
                <TableHead className="text-gray-400 text-center">Replenishment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map(part => (
                <TableRow key={part.id} className="border-gray-800/50">
                  <TableCell>
                    <p className="text-white font-medium text-sm">{part.part_name}</p>
                    {part.vendor_part_number && <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn("font-semibold", part.physical_stock <= 0 ? "text-red-400" : "text-white")}>
                      {part.physical_stock}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-gray-400">{part.reorder_point}</TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-red-600/80 text-white text-xs">-{part.shortage}</Badge>
                  </TableCell>
                  <TableCell className="text-gray-300 text-sm">{part.vendor_name}</TableCell>
                  <TableCell className="text-center">
                    {part.has_replenishment ? (
                      <Badge className={cn(
                        "text-xs",
                        part.covered_from_po > 0 ? "bg-blue-600/30 text-blue-300" : "bg-green-600/30 text-green-300"
                      )}>
                        {part.covered_from_po > 0 ? `On Order (${part.covered_from_po})` : `Planned (${part.replenishment_qty})`}
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-700/50 text-gray-500 text-xs">None</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReplenishmentTable({ commitments }) {
  if (commitments.length === 0) {
    return (
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-8 text-center text-gray-400">
          No auto-replenishment commitments. Run "Sync Replenishment" to generate.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="bg-black/40 border-gray-800">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800">
                <TableHead className="text-gray-400">Part</TableHead>
                <TableHead className="text-gray-400 text-center">Qty</TableHead>
                <TableHead className="text-gray-400 text-center">Stock</TableHead>
                <TableHead className="text-gray-400 text-center">Status</TableHead>
                <TableHead className="text-gray-400">Vendor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commitments.map(c => (
                <TableRow key={c.id} className="border-gray-800/50">
                  <TableCell className="text-white text-sm font-medium">{c.part_name}</TableCell>
                  <TableCell className="text-center text-white">{c.required_total}</TableCell>
                  <TableCell className="text-center text-gray-400">{c.physical_stock}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={cn("text-xs",
                      c.commitment_status === 'ordered' ? 'bg-blue-600/30 text-blue-300' :
                      c.commitment_status === 'planned' ? 'bg-yellow-600/30 text-yellow-300' :
                      'bg-gray-700/50 text-gray-400'
                    )}>
                      {c.commitment_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-300 text-sm">{c.vendor_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualOrdersTable({ commitments }) {
  if (commitments.length === 0) {
    return (
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-8 text-center text-gray-400">
          No manual stock orders. Use "Add Stock Order" in the{' '}
          <Link to={createPageUrl('GlobalNeedToOrder')} className="text-blue-400 hover:underline">Order Queue</Link>.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="bg-black/40 border-gray-800">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800">
                <TableHead className="text-gray-400">Part</TableHead>
                <TableHead className="text-gray-400 text-center">Qty</TableHead>
                <TableHead className="text-gray-400 text-center">Status</TableHead>
                <TableHead className="text-gray-400">Reason</TableHead>
                <TableHead className="text-gray-400">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commitments.map(c => (
                <TableRow key={c.id} className="border-gray-800/50">
                  <TableCell className="text-white text-sm font-medium">{c.part_name}</TableCell>
                  <TableCell className="text-center text-white">{c.required_total}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={cn("text-xs",
                      c.commitment_status === 'ordered' ? 'bg-blue-600/30 text-blue-300' :
                      'bg-yellow-600/30 text-yellow-300'
                    )}>
                      {c.commitment_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-400 text-sm capitalize">{(c.stock_reason || 'manual').replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-gray-500 text-xs truncate max-w-[200px]">{c.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}