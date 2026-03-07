import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { usePOReceivingView, useSupplyAction } from "@/components/supply/useProjectSupplyView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * POReceiving - PO-centric fast receiving page
 * 
 * Two modes:
 * 1. List mode: Shows all receivable POs
 * 2. Detail mode: Shows single PO for batch receiving (order_id in URL)
 * 
 * Design: open PO → check boxes → enter qty → assign location → receive all
 */
export default function POReceiving() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order_id');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');

  // Use different query based on mode
  const listView = usePOReceivingView(null, { search: searchTerm, vendor_id: vendorFilter !== 'all' ? vendorFilter : undefined });
  const detailView = usePOReceivingView(orderId);

  if (orderId) {
    return (
      <POReceivingDetail 
        po={detailView.po} 
        locations={detailView.locations}
        isLoading={detailView.isLoading}
        onBack={async () => {
          await queryClient.invalidateQueries({ queryKey: ['poReceivingView'] });
          navigate(createPageUrl('POReceiving'));
        }}
        refetch={detailView.refetch}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-green-500" />
            PO Receiving
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Fast batch receiving by purchase order
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => listView.refetch()}
          disabled={listView.isLoading}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", listView.isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      {listView.summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-white">{listView.summary.total_orders || 0}</div>
              <div className="text-sm text-gray-400">Open Orders</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-400">{listView.summary.total_lines || 0}</div>
              <div className="text-sm text-gray-400">Line Items</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-400">{listView.summary.total_qty_remaining || 0}</div>
              <div className="text-sm text-gray-400">Qty to Receive</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search PO number, vendor, part..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700"
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-48 bg-gray-900 border-gray-700">
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {listView.filterOptions?.vendors?.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {listView.isLoading ? (
          <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-500 mx-auto" />
            <p className="text-gray-400 mt-2">Loading orders...</p>
          </Card>
        ) : listView.orders?.length === 0 ? (
          <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-white font-medium">All caught up!</p>
            <p className="text-gray-400 text-sm">No orders waiting to be received</p>
          </Card>
        ) : (
          listView.orders?.map(po => (
            <Card 
              key={po.order_id} 
              className="bg-gray-900/50 border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
              onClick={() => navigate(createPageUrl('POReceiving') + `?order_id=${po.order_id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                      <Package className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{po.po_number}</span>
                        <Badge variant="outline" className={cn(
                          po.status === 'Ordered' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                          po.status === 'Partial' && "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        )}>
                          {po.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-400">
                        {po.vendor_name} • {po.total_lines} items
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-400">{po.total_qty_remaining}</div>
                    <div className="text-xs text-gray-500">to receive</div>
                  </div>
                </div>
                
                {/* DEV: Integrity warning for qty mismatch */}
                {process.env.NODE_ENV === 'development' && po._debug && po._debug.total_qty_ordered !== po.total_qty_ordered && (
                  <div className="mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-xs text-red-400">
                    ⚠ Qty Mismatch: Ordered={po.total_qty_ordered}, Debug Sum={po._debug.total_qty_ordered}
                  </div>
                )}
                
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{po.total_qty_received} received</span>
                    <span>{po.total_qty_ordered} ordered</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ 
                        width: `${po.total_qty_ordered > 0 
                          ? (po.total_qty_received / po.total_qty_ordered) * 100 
                          : 0}%` 
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * POReceivingDetail - Single PO batch receiving interface
 */
function POReceivingDetail({ po, locations, isLoading, onBack, refetch }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const supplyAction = useSupplyAction();
  const [lineInputs, setLineInputs] = useState({});
  const [selectedLines, setSelectedLines] = useState(new Set());
  const [defaultLocation, setDefaultLocation] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);

  // Initialize line inputs when PO loads
  React.useEffect(() => {
    if (po?.lines) {
      const initial = {};
      po.lines.forEach(line => {
        initial[line.line_item_id] = {
          receive_qty: line.qty_remaining,
          location_id: '',
        };
      });
      setLineInputs(initial);
      // Select all lines with remaining qty by default
      setSelectedLines(new Set(po.lines.filter(l => l.qty_remaining > 0).map(l => l.line_item_id)));
    }
  }, [po]);

  const updateLineInput = (lineId, field, value) => {
    setLineInputs(prev => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        [field]: value,
      },
    }));
  };

  const toggleLine = (lineId) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!po?.lines) return;
    setSelectedLines(new Set(po.lines.filter(l => l.qty_remaining > 0).map(l => l.line_item_id)));
  };

  const deselectAll = () => {
    setSelectedLines(new Set());
  };

  const receiveAll = () => {
    if (!po?.lines) return;
    const updated = { ...lineInputs };
    po.lines.forEach(line => {
      if (updated[line.line_item_id]) {
        updated[line.line_item_id].receive_qty = line.qty_remaining;
      }
    });
    setLineInputs(updated);
    selectAll();
  };

  const applyDefaultLocation = () => {
    if (!defaultLocation) return;
    const updated = { ...lineInputs };
    selectedLines.forEach(lineId => {
      if (updated[lineId]) {
        updated[lineId].location_id = defaultLocation;
      }
    });
    setLineInputs(updated);
    toast.success(`Applied location to ${selectedLines.size} items`);
  };

  const handleReceive = async () => {
    if (selectedLines.size === 0) {
      toast.error('Select at least one line to receive');
      return;
    }

    // Build receiving payload
    const lines = [];
    selectedLines.forEach(lineId => {
      const input = lineInputs[lineId];
      const line = po.lines.find(l => l.line_item_id === lineId);
      if (input && input.receive_qty > 0 && line) {
        lines.push({
          line_item_id: lineId,
          qty_received: input.receive_qty,
          location_id: input.location_id || defaultLocation || null,
        });
      }
    });

    if (lines.length === 0) {
      toast.error('No valid quantities to receive');
      return;
    }

    setIsReceiving(true);
    try {
      await supplyAction.execute({
        action_type: 'RECEIVE',
        commitment_ids: [], // Not needed for PO-level receiving
        payload: {
          order_id: po.order_id,
          lines,
        },
      });

      const totalReceived = lines.reduce((sum, l) => sum + l.qty_received, 0);
      toast.success(`Received ${lines.length} line items`, {
        description: `Total qty: ${totalReceived}`,
      });

      // Invalidate all relevant caches so list + supply views refresh
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['poReceivingView'] }),
        queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] }),
        queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] }),
      ]);

      // Auto-navigate back if PO is fully received
      if (po.total_qty_remaining <= totalReceived) {
        navigate(createPageUrl('POReceiving'));
      }
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
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </Button>
      </div>
    );
  }

  const totalToReceive = Array.from(selectedLines).reduce((sum, lineId) => {
    return sum + (lineInputs[lineId]?.receive_qty || 0);
  }, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-green-500" />
              {po.po_number}
            </h1>
            <p className="text-gray-400 text-sm">
              {po.vendor_name} • {po.order_date}
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
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-1" />
              {po.pdf_attachments.length} Docs
            </Button>
          )}
        </div>
      </div>

      {/* Quick Actions Bar */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={receiveAll}>
                Receive All Remaining
              </Button>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAll}>
                Clear Selection
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
                    <SelectItem value={null}>No location</SelectItem>
                    {locations?.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={applyDefaultLocation}
                  disabled={!defaultLocation || selectedLines.size === 0}
                >
                  Apply to Selected
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items Table */}
      <Card className="bg-gray-900/50 border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-700 hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox 
                  checked={selectedLines.size === po.lines?.filter(l => l.qty_remaining > 0).length}
                  onCheckedChange={(checked) => checked ? selectAll() : deselectAll()}
                />
              </TableHead>
              <TableHead>Part</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="w-28">Receive Qty</TableHead>
              <TableHead className="w-48">Location</TableHead>
              <TableHead>Project</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.lines?.map(line => {
              const input = lineInputs[line.line_item_id] || { receive_qty: 0, location_id: '' };
              const isSelected = selectedLines.has(line.line_item_id);
              const isFullyReceived = line.qty_remaining === 0;

              return (
                <TableRow 
                  key={line.line_item_id} 
                  className={cn(
                    "border-gray-700",
                    isFullyReceived && "opacity-50",
                    isSelected && "bg-green-900/10"
                  )}
                >
                  <TableCell>
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={() => toggleLine(line.line_item_id)}
                      disabled={isFullyReceived}
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
                        <div className="font-medium text-white">{line.part_name}</div>
                        {line.vendor_part_number && (
                          <div className="text-xs text-gray-500 font-mono">{line.vendor_part_number}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.qty_ordered}
                    {/* DEV: Debug integrity check */}
                    {process.env.NODE_ENV === 'development' && line._debug_qty_ordered !== undefined && line._debug_qty_ordered !== line.qty_ordered && (
                      <span className="ml-1 text-xs text-red-400" title={`Debug sum: ${line._debug_qty_ordered}`}>⚠</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-400">{line.qty_received}</TableCell>
                  <TableCell className="text-right font-mono text-blue-400">{line.qty_remaining}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={line.qty_remaining}
                      value={input.receive_qty}
                      onChange={(e) => updateLineInput(line.line_item_id, 'receive_qty', parseInt(e.target.value) || 0)}
                      disabled={isFullyReceived}
                      className="w-20 h-8 text-center bg-gray-800 border-gray-600"
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={input.location_id} 
                      onValueChange={(v) => updateLineInput(line.line_item_id, 'location_id', v)}
                      disabled={isFullyReceived}
                    >
                      <SelectTrigger className="h-8 bg-gray-800 border-gray-600">
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>No location</SelectItem>
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

      {/* Receive Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-4 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-sm text-gray-400">
            <span className="text-white font-bold">{selectedLines.size}</span> items selected • 
            <span className="text-green-400 font-bold ml-1">{totalToReceive}</span> units to receive
          </div>
          <Button 
            onClick={handleReceive}
            disabled={selectedLines.size === 0 || totalToReceive === 0 || isReceiving || po.total_qty_remaining === 0}
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
    </div>
  );
}