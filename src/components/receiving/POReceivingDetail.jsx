import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { useSupplyAction, supplyKeys } from "@/components/supply/useProjectSupplyView";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  TableCell,
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

const LOCATION_NONE = "__none__";

/**
 * POReceivingDetail - Single PO batch receiving interface
 * 
 * Key design decisions:
 * - Local line input state initializes ONCE on entry, then only rebuilds after successful receive
 * - Uses a "generation" counter to force re-init from fresh server data post-receive
 * - Location selects use "__none__" sentinel instead of null
 */
export default function POReceivingDetail({ po, locations, isLoading, refetch }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const supplyAction = useSupplyAction();
  
  const [lineInputs, setLineInputs] = useState({});
  const [selectedLines, setSelectedLines] = useState(new Set());
  const [defaultLocation, setDefaultLocation] = useState(LOCATION_NONE);
  const [isReceiving, setIsReceiving] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  // Generation counter - incremented after each receive to force re-init from server data
  const [generation, setGeneration] = useState(0);

  // Split lines into open and completed
  const { openLines, completedLines } = useMemo(() => {
    if (!po?.lines) return { openLines: [], completedLines: [] };
    const open = po.lines.filter(l => l.qty_remaining > 0 && !l.is_line_cancelled);
    const completed = po.lines.filter(l => l.qty_remaining === 0 || l.is_line_cancelled);
    return { openLines: open, completedLines: completed };
  }, [po?.lines]);

  // Initialize/rebuild line inputs from PO data
  // Only runs on first load OR after generation changes (post-receive)
  useEffect(() => {
    if (!po?.lines) return;
    const initial = {};
    po.lines.forEach(line => {
      initial[line.line_item_id] = {
        receive_qty: line.qty_remaining,
        location_id: LOCATION_NONE,
      };
    });
    setLineInputs(initial);
    // Select all open lines by default
    setSelectedLines(new Set(openLines.map(l => l.line_item_id)));
  }, [generation, po?.order_id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!po?.lines) return;
    const updated = { ...lineInputs };
    openLines.forEach(line => {
      if (updated[line.line_item_id]) {
        updated[line.line_item_id].receive_qty = line.qty_remaining;
      }
    });
    setLineInputs(updated);
    selectAllOpen();
  }, [po?.lines, lineInputs, openLines, selectAllOpen]);

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

  const handleReceive = async () => {
    if (selectedLines.size === 0) {
      toast.error('Select at least one line to receive');
      return;
    }

    // Build and sanitize payload
    const lines = [];
    const skipped = [];
    
    selectedLines.forEach(lineId => {
      const input = lineInputs[lineId];
      const line = po.lines.find(l => l.line_item_id === lineId);
      if (!input || !line) return;
      
      // Sanitize qty: must be integer, positive, clamped to remaining
      let qty = Math.floor(Number(input.receive_qty) || 0);
      if (qty <= 0) { skipped.push({ lineId, reason: 'qty <= 0' }); return; }
      if (line.qty_remaining <= 0) { skipped.push({ lineId, reason: 'fully received' }); return; }
      qty = Math.min(qty, line.qty_remaining);
      
      // Map location sentinel to null
      const location = input.location_id === LOCATION_NONE ? null : (input.location_id || null);
      
      lines.push({
        line_item_id: lineId,
        qty_received: qty,
        location_id: location,
      });
    });

    if (lines.length === 0) {
      toast.error('No valid quantities to receive. Check that quantities are positive and lines are not fully received.');
      return;
    }

    // Dev diagnostic logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[POReceiving] RECEIVE payload:', {
        order_id: po.order_id,
        selected_count: selectedLines.size,
        valid_lines: lines.length,
        skipped,
        payload_lines: lines,
      });
    }

    setIsReceiving(true);
    try {
      const result = await supplyAction.execute({
        action_type: 'RECEIVE',
        commitment_ids: [],
        payload: {
          order_id: po.order_id,
          lines,
        },
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('[POReceiving] RECEIVE result:', {
          lines_received: result.lines_received,
          total_qty: result.total_qty_received,
          order_status: result.order_status,
          results: result.results?.map(r => ({
            line: r.line_item_id,
            qty: r.qty_received,
            status: r.line_status,
          })),
        });
      }

      const totalReceived = lines.reduce((sum, l) => sum + l.qty_received, 0);
      toast.success(`Received ${lines.length} line items (${totalReceived} units)`);

      // DETERMINISTIC POST-RECEIVE FLOW:
      // 1. forceAppRefresh already ran inside useSupplyAction.onSuccess
      // 2. Now explicitly refetch the PO detail AND list queries
      // 3. Then inspect fresh data to decide navigation
      
      // Refetch PO detail (the current view)
      const freshDetailData = await queryClient.fetchQuery({
        queryKey: ['poReceivingView', po.order_id, '{}'],
        queryFn: async () => {
          const { base44 } = await import("@/api/base44Client");
          const response = await base44.functions.invoke('getPOReceivingView', {
            order_id: po.order_id,
            filters: {},
          });
          return response.data;
        },
        staleTime: 0,
      });

      // Also invalidate the list view so it's fresh when navigating back
      await queryClient.invalidateQueries({ queryKey: ['poReceivingView', null] });

      // Check fresh PO state
      const freshPO = freshDetailData?.po;
      if (freshPO && freshPO.total_qty_remaining <= 0) {
        toast.success('PO fully received!', { description: `${po.po_number} is complete` });
        navigate(createPageUrl('POReceiving'));
        return;
      }

      // Stay on page - bump generation to rebuild local state from fresh data
      setGeneration(g => g + 1);
      // Also trigger the hook refetch to update the po prop
      refetch();
      
    } catch (error) {
      toast.error('Failed to receive: ' + error.message);
    } finally {
      setIsReceiving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!po) {
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
    const line = po.lines.find(l => l.line_item_id === lineId);
    if (!input || !line || line.qty_remaining <= 0) return sum;
    const qty = Math.min(Math.floor(Number(input.receive_qty) || 0), line.qty_remaining);
    return sum + Math.max(0, qty);
  }, 0);

  return (
    <div className="p-6 space-y-6 pb-24">
      {/* Header - Enhanced */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={async () => {
            await queryClient.invalidateQueries({ queryKey: ['poReceivingView', null] });
            navigate(createPageUrl('POReceiving'));
          }} className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white font-mono">{po.po_number}</h1>
              <Badge variant="outline" className={cn(
                po.status === 'Ordered' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                po.status === 'Partial' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                po.status === 'Received' && "bg-green-500/20 text-green-400 border-green-500/30",
                po.status === 'Draft' && "bg-gray-500/20 text-gray-400 border-gray-500/30"
              )}>
                {po.status}
              </Badge>
            </div>
            <p className="text-gray-400 text-sm">
              {po.vendor_name} • Ordered {po.order_date || 'N/A'}
              {po.order_number && ` • Ref: ${po.order_number}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {po.order_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={po.order_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                View Order
              </a>
            </Button>
          )}
          {po.pdf_attachments?.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => {
              if (po.pdf_attachments.length === 1) {
                window.open(po.pdf_attachments[0].url, '_blank');
              }
            }}>
              <FileText className="w-4 h-4 mr-1" />
              {po.pdf_attachments.length} Doc{po.pdf_attachments.length > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      </div>

      {/* PO Summary Strip */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-white">{po.total_qty_ordered}</div>
            <div className="text-xs text-gray-500">Ordered</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-green-400">{po.total_qty_received}</div>
            <div className="text-xs text-gray-500">Received</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-blue-400">{po.total_qty_remaining}</div>
            <div className="text-xs text-gray-500">Remaining</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-white">{po.progress_pct || 0}%</div>
            <div className="text-xs text-gray-500">Complete</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${po.progress_pct || 0}%` }}
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
              Open Items ({openLines.length})
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
              {openLines.map(line => {
                const input = lineInputs[line.line_item_id] || { receive_qty: 0, location_id: LOCATION_NONE };
                const isSelected = selectedLines.has(line.line_item_id);

                return (
                  <TableRow 
                    key={line.line_item_id} 
                    className={cn(
                      "border-gray-700",
                      isSelected && "bg-green-900/10"
                    )}
                  >
                    <TableCell>
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={() => toggleLine(line.line_item_id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {line.featured_photo ? (
                          <img src={line.featured_photo} alt="" className="w-8 h-8 rounded object-contain bg-gray-800" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-500" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white text-sm">{line.part_name}</div>
                          {line.vendor_part_number && (
                            <div className="text-xs text-gray-500 font-mono">{line.vendor_part_number}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-300">{line.qty_ordered}</TableCell>
                    <TableCell className="text-right font-mono text-green-400">{line.qty_received}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-blue-400">{line.qty_remaining}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={line.qty_remaining}
                        value={input.receive_qty}
                        onChange={(e) => {
                          const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), line.qty_remaining);
                          updateLineInput(line.line_item_id, 'receive_qty', val);
                        }}
                        className="w-20 h-8 text-center bg-gray-800 border-gray-600"
                      />
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={input.location_id || LOCATION_NONE}
                        onValueChange={(v) => updateLineInput(line.line_item_id, 'location_id', v)}
                      >
                        <SelectTrigger className="h-8 bg-gray-800 border-gray-600">
                          <SelectValue placeholder="Location" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={LOCATION_NONE}>No location</SelectItem>
                          {locations?.map(loc => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-400">{line.project_name}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
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

      {/* Completed Lines Section (collapsible) */}
      {completedLines.length > 0 && (
        <div>
          <button 
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-2"
          >
            {showCompleted ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Fully Received ({completedLines.length} items)
          </button>
          
          {showCompleted && (
            <Card className="bg-gray-900/30 border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="w-10" />
                    <TableHead>Part</TableHead>
                    <TableHead className="text-right w-20">Ordered</TableHead>
                    <TableHead className="text-right w-20">Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Project</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedLines.map(line => (
                    <TableRow 
                      key={line.line_item_id} 
                      className="border-gray-800 opacity-50"
                    >
                      <TableCell>
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {line.featured_photo ? (
                            <img src={line.featured_photo} alt="" className="w-8 h-8 rounded object-contain bg-gray-800" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center">
                              <Package className="w-4 h-4 text-gray-600" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-400 text-sm">{line.part_name}</div>
                            {line.vendor_part_number && (
                              <div className="text-xs text-gray-600 font-mono">{line.vendor_part_number}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-500">{line.qty_ordered}</TableCell>
                      <TableCell className="text-right font-mono text-green-600">{line.qty_received}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "text-xs",
                          line.is_line_cancelled 
                            ? "bg-red-500/20 text-red-400 border-red-500/30" 
                            : "bg-green-500/20 text-green-400 border-green-500/30"
                        )}>
                          {line.is_line_cancelled ? 'Cancelled' : 'Received'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">{line.project_name}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
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