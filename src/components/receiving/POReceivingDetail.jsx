import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { supplyKeys } from "@/components/supply/useProjectSupplyView";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Package,
  Truck,
  MapPin,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import POReceivingLineRow from "./POReceivingLineRow";
import POReceivingCompletedLines from "./POReceivingCompletedLines";

const LOCATION_NONE = "__none__";

/**
 * POReceivingDetail - Single PO batch receiving interface
 * 
 * OPTIMISTIC UPDATE PATTERN:
 * 1. User clicks Receive
 * 2. Immediately apply optimistic local state (updated qtys, deselect received lines)
 * 3. Fire backend action (no await on forceAppRefresh)
 * 4. Background: fetch fresh PO data to verify/reconcile
 * 5. Navigation decision uses fresh backend data only
 */
export default function POReceivingDetail({ po, locations, isLoading, refetch }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [lineInputs, setLineInputs] = useState({});
  const [selectedLines, setSelectedLines] = useState(new Set());
  const [defaultLocation, setDefaultLocation] = useState(LOCATION_NONE);
  const [isReceiving, setIsReceiving] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  // Optimistic PO overlay — applied on top of server PO data for instant UI
  const [optimisticDeltas, setOptimisticDeltas] = useState(null);
  const initializedForRef = useRef(null);

  // Merge optimistic deltas on top of server PO data
  const effectivePO = useMemo(() => {
    if (!po || !optimisticDeltas) return po;
    const deltaMap = new Map(optimisticDeltas.map(d => [d.line_item_id, d.qty_received]));
    const mergedLines = po.lines.map(line => {
      const delta = deltaMap.get(line.line_item_id);
      if (delta == null) return line;
      return {
        ...line,
        qty_received: line.qty_received + delta,
        qty_remaining: Math.max(0, line.qty_remaining - delta),
      };
    });
    const totalReceived = mergedLines.reduce((s, l) => s + l.qty_received, 0);
    const totalRemaining = mergedLines.reduce((s, l) => s + Math.max(0, l.qty_remaining), 0);
    const totalOrdered = po.total_qty_ordered || mergedLines.reduce((s, l) => s + l.qty_ordered, 0);
    return {
      ...po,
      lines: mergedLines,
      total_qty_received: totalReceived,
      total_qty_remaining: totalRemaining,
      progress_pct: totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0,
    };
  }, [po, optimisticDeltas]);

  // Split lines into open and completed using effective (optimistic) data
  const { openLines, completedLines } = useMemo(() => {
    if (!effectivePO?.lines) return { openLines: [], completedLines: [] };
    const open = effectivePO.lines.filter(l => l.qty_remaining > 0 && !l.is_line_cancelled);
    const completed = effectivePO.lines.filter(l => l.qty_remaining === 0 || l.is_line_cancelled);
    return { openLines: open, completedLines: completed };
  }, [effectivePO?.lines]);

  // Rebuild local state from PO data
  const rebuildStateFromPO = useCallback((poData) => {
    if (!poData?.lines) return;
    const initial = {};
    poData.lines.forEach(line => {
      initial[line.line_item_id] = {
        receive_qty: line.qty_remaining,
        location_id: LOCATION_NONE,
      };
    });
    setLineInputs(initial);
    const freshOpen = poData.lines.filter(l => l.qty_remaining > 0 && !l.is_line_cancelled);
    setSelectedLines(new Set(freshOpen.map(l => l.line_item_id)));
    initializedForRef.current = poData.order_id;
  }, []);

  // Initialize ONCE when PO first loads or on different PO
  useEffect(() => {
    if (!po?.order_id) return;
    if (initializedForRef.current === po.order_id) return;
    rebuildStateFromPO(po);
  }, [po?.order_id, po, rebuildStateFromPO]);

  const updateLineInput = useCallback((lineId, field, value) => {
    setLineInputs(prev => ({
      ...prev,
      [lineId]: { ...prev[lineId], [field]: value },
    }));
  }, []);

  const toggleLine = useCallback((lineId) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  const selectAllOpen = useCallback(() => {
    setSelectedLines(new Set(openLines.map(l => l.line_item_id)));
  }, [openLines]);

  const deselectAll = useCallback(() => {
    setSelectedLines(new Set());
  }, []);

  const receiveAllRemaining = useCallback(() => {
    if (!effectivePO?.lines) return;
    const updated = { ...lineInputs };
    openLines.forEach(line => {
      if (updated[line.line_item_id]) {
        updated[line.line_item_id].receive_qty = line.qty_remaining;
      }
    });
    setLineInputs(updated);
    selectAllOpen();
  }, [effectivePO?.lines, lineInputs, openLines, selectAllOpen]);

  const applyDefaultLocation = useCallback(() => {
    if (defaultLocation === LOCATION_NONE) return;
    const updated = { ...lineInputs };
    selectedLines.forEach(lineId => {
      if (updated[lineId]) {
        updated[lineId].location_id = defaultLocation;
      }
    });
    setLineInputs(updated);
    toast.success(`Applied location to ${selectedLines.size} items`);
  }, [defaultLocation, lineInputs, selectedLines]);

  // ─── RECEIVE HANDLER WITH OPTIMISTIC UPDATE ───
  const handleReceive = async () => {
    if (selectedLines.size === 0) {
      toast.error('Select at least one line to receive');
      return;
    }

    // Build payload
    const lines = [];
    selectedLines.forEach(lineId => {
      const input = lineInputs[lineId];
      const line = effectivePO.lines.find(l => l.line_item_id === lineId);
      if (!input || !line) return;
      let qty = Math.floor(Number(input.receive_qty) || 0);
      if (qty <= 0 || line.qty_remaining <= 0) return;
      qty = Math.min(qty, line.qty_remaining);
      const location = input.location_id === LOCATION_NONE ? null : (input.location_id || null);
      lines.push({ line_item_id: lineId, receive_qty: qty, location_id: location });
    });

    if (lines.length === 0) {
      toast.error('No valid quantities to receive.');
      return;
    }

    // ── STEP 1: Optimistic UI update (INSTANT) ──
    setIsReceiving(true);
    const deltas = lines.map(l => ({ line_item_id: l.line_item_id, qty_received: l.receive_qty }));
    setOptimisticDeltas(deltas);

    // Optimistically rebuild line inputs for the new remaining qtys
    const newInputs = { ...lineInputs };
    const newSelected = new Set();
    lines.forEach(l => {
      const serverLine = effectivePO.lines.find(sl => sl.line_item_id === l.line_item_id);
      if (!serverLine) return;
      const newRemaining = Math.max(0, serverLine.qty_remaining - l.receive_qty);
      newInputs[l.line_item_id] = { receive_qty: newRemaining, location_id: LOCATION_NONE };
    });
    // Keep unaffected open lines selected, auto-select remaining open lines
    effectivePO.lines.forEach(line => {
      const delta = deltas.find(d => d.line_item_id === line.line_item_id);
      const newRemaining = delta ? Math.max(0, line.qty_remaining - delta.qty_received) : line.qty_remaining;
      if (newRemaining > 0 && !line.is_line_cancelled) {
        newSelected.add(line.line_item_id);
        if (!newInputs[line.line_item_id]) {
          newInputs[line.line_item_id] = { receive_qty: newRemaining, location_id: LOCATION_NONE };
        }
      }
    });
    setLineInputs(newInputs);
    setSelectedLines(newSelected);

    const totalReceived = lines.reduce((sum, l) => sum + l.receive_qty, 0);
    toast.success(`Received ${lines.length} line items (${totalReceived} units)`);

    try {
      // ── STEP 2: Fire backend action ──
      // Use direct invoke to skip forceAppRefresh (we handle refresh ourselves)
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'RECEIVE',
        commitment_ids: [],
        payload: { order_id: effectivePO.order_id, lines },
        dry_run: false,
      });
      const result = response.data;
      if (result?.error) throw new Error(result.error);

      // Surface partial failures from batch receive
      if (result?.errors?.length > 0) {
        toast.warning(`${result.errors.length} line(s) failed to receive`, {
          description: result.errors.map(e => e.error).join('; '),
        });
      }

      // ── STEP 3: Background verification with fresh backend data ──
      const detailQueryKey = supplyKeys.poReceiving(effectivePO.order_id, {});
      const freshDetailData = await queryClient.fetchQuery({
        queryKey: detailQueryKey,
        queryFn: async () => {
          const res = await base44.functions.invoke('getPOReceivingView', {
            order_id: effectivePO.order_id,
            filters: {},
          });
          return res.data;
        },
        staleTime: 0,
      });

      // Clear optimistic overlay — real data is now in cache
      setOptimisticDeltas(null);

      // ── STEP 4: Navigation decision from FRESH backend data ──
      const freshPO = freshDetailData?.po;
      if (freshPO && freshPO.total_qty_remaining <= 0) {
        // Invalidate list cache using prefix match (covers all filter variants)
        queryClient.invalidateQueries({ queryKey: ['poReceivingView', null], exact: false });
        toast.success('PO fully received!', { description: `${effectivePO.po_number} is complete` });
        navigate(createPageUrl('POReceiving'));
        return;
      }

      // ── STEP 5: Reconcile — rebuild state from fresh data ──
      initializedForRef.current = null;
      await refetch();

      // ── STEP 6: Background invalidation for other views (non-blocking) ──
      backgroundInvalidate(queryClient, result);

    } catch (error) {
      // Rollback optimistic state
      setOptimisticDeltas(null);
      initializedForRef.current = null;
      await refetch();
      toast.error('Failed to receive: ' + error.message);
    } finally {
      setIsReceiving(false);
    }
  };

  if (!effectivePO) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <p className="text-white font-medium">Order not found</p>
        <Button variant="outline" onClick={() => navigate(createPageUrl('POReceiving'))} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </Button>
      </div>
    );
  }

  const totalToReceive = Array.from(selectedLines).reduce((sum, lineId) => {
    const input = lineInputs[lineId];
    const line = effectivePO.lines.find(l => l.line_item_id === lineId);
    if (!input || !line || line.qty_remaining <= 0) return sum;
    const qty = Math.min(Math.floor(Number(input.receive_qty) || 0), line.qty_remaining);
    return sum + Math.max(0, qty);
  }, 0);

  return (
    <div className="p-6 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={async () => {
            await queryClient.invalidateQueries({ queryKey: ['poReceivingView', null], exact: false });
            navigate(createPageUrl('POReceiving'));
          }} className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white font-mono">{effectivePO.po_number}</h1>
              <Badge variant="outline" className={cn(
                effectivePO.status === 'Ordered' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                effectivePO.status === 'Partial' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                effectivePO.status === 'Received' && "bg-green-500/20 text-green-400 border-green-500/30",
                effectivePO.status === 'Draft' && "bg-gray-500/20 text-gray-400 border-gray-500/30"
              )}>
                {effectivePO.status}
              </Badge>
              {optimisticDeltas && (
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs animate-pulse">
                  Syncing...
                </Badge>
              )}
            </div>
            <p className="text-gray-400 text-sm">
              {effectivePO.vendor_name} • Ordered {effectivePO.order_date || 'N/A'}
              {effectivePO.order_number && ` • Ref: ${effectivePO.order_number}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {effectivePO.order_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={effectivePO.order_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                View Order
              </a>
            </Button>
          )}
          {effectivePO.pdf_attachments?.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => {
              if (effectivePO.pdf_attachments.length === 1) {
                window.open(effectivePO.pdf_attachments[0].url, '_blank');
              }
            }}>
              <FileText className="w-4 h-4 mr-1" />
              {effectivePO.pdf_attachments.length} Doc{effectivePO.pdf_attachments.length > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      </div>

      {/* PO Summary Strip */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-white">{effectivePO.total_qty_ordered}</div>
            <div className="text-xs text-gray-500">Ordered</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-green-400">{effectivePO.total_qty_received}</div>
            <div className="text-xs text-gray-500">Received</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-blue-400">{effectivePO.total_qty_remaining}</div>
            <div className="text-xs text-gray-500">Remaining</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-white">{effectivePO.progress_pct || 0}%</div>
            <div className="text-xs text-gray-500">Complete</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${effectivePO.progress_pct || 0}%` }}
        />
      </div>

      {/* Quick Actions Bar */}
      {openLines.length > 0 && (
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={receiveAllRemaining}>
                  Receive All Remaining
                </Button>
                <Button variant="ghost" size="sm" onClick={selectAllOpen}>
                  Select All ({openLines.length})
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Clear
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <Select value={defaultLocation} onValueChange={setDefaultLocation}>
                    <SelectTrigger className="w-48 bg-gray-800 border-gray-600">
                      <SelectValue placeholder="Default location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LOCATION_NONE}>No location</SelectItem>
                      {locations?.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={applyDefaultLocation}
                    disabled={defaultLocation === LOCATION_NONE || selectedLines.size === 0}
                  >
                    Apply to Selected
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open Lines Section */}
      {openLines.length > 0 ? (
        <Card className="bg-gray-900/50 border-gray-700">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-400" />
              Not Received ({openLines.length})
            </h3>
            <span className="text-xs text-gray-500">{selectedLines.size} selected</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700 hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox 
                    checked={selectedLines.size === openLines.length && openLines.length > 0}
                    onCheckedChange={(checked) => checked ? selectAllOpen() : deselectAll()}
                  />
                </TableHead>
                <TableHead>Part</TableHead>
                <TableHead className="text-right w-20">Ordered</TableHead>
                <TableHead className="text-right w-20">Received</TableHead>
                <TableHead className="text-right w-20">Remaining</TableHead>
                <TableHead className="w-28">Receive Qty</TableHead>
                <TableHead className="w-48">Location</TableHead>
                <TableHead>Project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openLines.map(line => (
                <POReceivingLineRow
                  key={line.line_item_id}
                  line={line}
                  input={lineInputs[line.line_item_id] || { receive_qty: 0, location_id: LOCATION_NONE }}
                  isSelected={selectedLines.has(line.line_item_id)}
                  locations={locations}
                  onToggle={toggleLine}
                  onUpdateInput={updateLineInput}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-white font-medium">All items received!</p>
          <p className="text-gray-400 text-sm">This PO is fully received</p>
        </Card>
      )}

      {/* Completed Lines Section */}
      {completedLines.length > 0 && (
        <POReceivingCompletedLines
          lines={completedLines}
          showCompleted={showCompleted}
          onToggle={() => setShowCompleted(!showCompleted)}
        />
      )}

      {/* Receive Action Footer */}
      {openLines.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-4 backdrop-blur-sm z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-400">
              <span className="text-white font-bold">{selectedLines.size}</span> items selected • 
              <span className="text-green-400 font-bold ml-1">{totalToReceive}</span> units to receive
            </div>
            <Button 
              onClick={handleReceive}
              disabled={selectedLines.size === 0 || totalToReceive === 0 || isReceiving}
              className="bg-green-600 hover:bg-green-700"
            >
              {isReceiving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Receiving...
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4 mr-2" />
                  Receive Selected ({totalToReceive} units)
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Non-blocking background invalidation for other views.
 * Fires after the PO detail is already reconciled.
 * Does not block UI or navigation.
 */
function backgroundInvalidate(queryClient, result) {
  // Collect affected entity IDs from result
  const partIds = new Set();
  const projectIds = new Set();
  if (result?.results) {
    result.results.forEach(r => {
      if (r.part_id) partIds.add(r.part_id);
      if (r.project_id) projectIds.add(r.project_id);
    });
  }

  // Fire-and-forget — these queries will refetch when their views are next accessed
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: ['parts'] }),
    queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] }),
    queryClient.invalidateQueries({ queryKey: ['partCommitments'] }),
    queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] }),
    queryClient.invalidateQueries({ queryKey: ['orders'] }),
    queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] }),
    queryClient.invalidateQueries({ queryKey: ['projectPurchaseOrders'] }),
    queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }),
    // Invalidate list view so it's fresh on return (prefix match covers all filter variants)
    queryClient.invalidateQueries({ queryKey: ['poReceivingView', null], exact: false }),
  ];

  // Scoped invalidations
  partIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['part', String(id)] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['partsInventoryView', String(id)] }));
  });
  projectIds.forEach(id => {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectSupplyView', String(id)] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['projectPurchaseOrders', String(id)] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['billingProcurementStates', String(id)] }));
  });

  // Non-blocking
  Promise.all(invalidations).catch(() => {});
}