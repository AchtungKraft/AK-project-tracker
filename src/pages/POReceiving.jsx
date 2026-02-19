import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { 
  Package, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft,
  MapPin,
  Save,
  Loader2,
  ClipboardCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import MobileSafeAreaContainer from '@/components/mobile/MobileSafeAreaContainer';

export default function POReceiving() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order_id');

  // State for receiving quantities per line item
  const [receivingData, setReceivingData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch order
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const orders = await base44.entities.Order.filter({ id: orderId });
      return orders[0] || null;
    },
    enabled: !!orderId
  });

  // Fetch line items for this order
  const { data: lineItems = [], isLoading: lineItemsLoading } = useQuery({
    queryKey: ['orderLineItems', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      return base44.entities.PartPurchaseLineItem.filter({ order_id: orderId });
    },
    enabled: !!orderId
  });

  // Fetch parts for line items
  const { data: parts = [] } = useQuery({
    queryKey: ['lineParts', lineItems.map(li => li.part_id).join(',')],
    queryFn: async () => {
      const partIds = [...new Set(lineItems.map(li => li.part_id).filter(Boolean))];
      if (partIds.length === 0) return [];
      return base44.entities.Part.filter({ id: { $in: partIds } });
    },
    enabled: lineItems.length > 0
  });

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.filter({ active: true })
  });

  // Fetch vendor
  const { data: vendor } = useQuery({
    queryKey: ['vendor', order?.vendor_id],
    queryFn: async () => {
      if (!order?.vendor_id) return null;
      const vendors = await base44.entities.Vendor.filter({ id: order.vendor_id });
      return vendors[0] || null;
    },
    enabled: !!order?.vendor_id
  });

  // Build part map
  const partMap = useMemo(() => new Map(parts.map(p => [p.id, p])), [parts]);

  // Receive mutation using unified dispatcher
  const receiveMutation = useMutation({
    mutationFn: async (receivePayload) => {
      const result = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'RECEIVE',
        commitment_ids: [],
        payload: receivePayload
      });
      if (result.data?.error) throw new Error(result.data.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderLineItems', orderId] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    }
  });

  // Handle quantity change for a line item
  const handleQtyChange = (lineItemId, value) => {
    setReceivingData(prev => ({
      ...prev,
      [lineItemId]: {
        ...prev[lineItemId],
        qty: Math.max(0, parseInt(value) || 0)
      }
    }));
  };

  // Handle location change for a line item
  const handleLocationChange = (lineItemId, locationId) => {
    setReceivingData(prev => ({
      ...prev,
      [lineItemId]: {
        ...prev[lineItemId],
        location_id: locationId
      }
    }));
  };

  // Submit all receiving
  const handleSubmitReceiving = async () => {
    const itemsToReceive = Object.entries(receivingData)
      .filter(([_, data]) => data.qty > 0)
      .map(([lineItemId, data]) => ({
        line_item_id: lineItemId,
        qty_received: data.qty,
        location_id: data.location_id
      }));

    if (itemsToReceive.length === 0) {
      toast.warning('No quantities entered to receive');
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const item of itemsToReceive) {
      try {
        await receiveMutation.mutateAsync(item);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error('Receive error:', error);
      }
    }

    setIsSubmitting(false);
    setReceivingData({});

    if (successCount > 0) {
      toast.success(`Received ${successCount} line item(s)`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} item(s) failed to receive`);
    }

    // Refetch
    queryClient.invalidateQueries({ queryKey: ['orderLineItems', orderId] });
    queryClient.invalidateQueries({ queryKey: ['order', orderId] });
  };

  // Compute totals
  const totals = useMemo(() => {
    let totalOrdered = 0;
    let totalReceived = 0;
    let totalPending = 0;

    for (const li of lineItems) {
      const ordered = li.qty_ordered ?? 0;
      const received = li.qty_received ?? 0;
      totalOrdered += ordered;
      totalReceived += received;
      totalPending += Math.max(0, ordered - received);
    }

    return { totalOrdered, totalReceived, totalPending };
  }, [lineItems]);

  // Check if all received
  const isFullyReceived = totals.totalPending === 0;

  if (!orderId) {
    return (
      <MobileSafeAreaContainer>
        <div className="p-6">
          <div className="text-center py-12">
            <Package className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Order Selected</h2>
            <p className="text-gray-400 mb-4">Please select a purchase order to receive.</p>
            <Link to={createPageUrl('SupplyQueues')}>
              <Button variant="outline">View Orders</Button>
            </Link>
          </div>
        </div>
      </MobileSafeAreaContainer>
    );
  }

  if (orderLoading || lineItemsLoading) {
    return (
      <MobileSafeAreaContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        </div>
      </MobileSafeAreaContainer>
    );
  }

  if (!order) {
    return (
      <MobileSafeAreaContainer>
        <div className="p-6">
          <div className="text-center py-12">
            <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Order Not Found</h2>
            <p className="text-gray-400 mb-4">The requested order could not be found.</p>
            <Link to={createPageUrl('SupplyQueues')}>
              <Button variant="outline">Back to Orders</Button>
            </Link>
          </div>
        </div>
      </MobileSafeAreaContainer>
    );
  }

  return (
    <MobileSafeAreaContainer>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('SupplyQueues')}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Truck className="w-6 h-6 text-blue-400" />
                Receive PO: {order.po_number}
              </h1>
              <p className="text-gray-400 text-sm">
                {vendor?.vendor_name || 'Unknown Vendor'} • {order.order_date}
              </p>
            </div>
          </div>
          
          <Badge 
            variant={isFullyReceived ? 'default' : 'outline'}
            className={isFullyReceived ? 'bg-green-600' : 'border-yellow-500 text-yellow-500'}
          >
            {isFullyReceived ? 'Fully Received' : order.status}
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{totals.totalOrdered}</p>
              <p className="text-xs text-gray-400">Total Ordered</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{totals.totalReceived}</p>
              <p className="text-xs text-gray-400">Received</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-400">{totals.totalPending}</p>
              <p className="text-xs text-gray-400">Pending</p>
            </CardContent>
          </Card>
        </div>

        {/* Line Items Table */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-green-400" />
              Line Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700 hover:bg-transparent">
                    <TableHead className="text-gray-400">Part</TableHead>
                    <TableHead className="text-gray-400 text-center">Ordered</TableHead>
                    <TableHead className="text-gray-400 text-center">Received</TableHead>
                    <TableHead className="text-gray-400 text-center">Remaining</TableHead>
                    <TableHead className="text-gray-400 text-center w-28">Receive Qty</TableHead>
                    <TableHead className="text-gray-400 w-40">Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map(lineItem => {
                    const part = partMap.get(lineItem.part_id);
                    const ordered = lineItem.qty_ordered ?? 0;
                    const received = lineItem.qty_received ?? 0;
                    const remaining = Math.max(0, ordered - received);
                    const receivingQty = receivingData[lineItem.id]?.qty || 0;
                    const receivingLocation = receivingData[lineItem.id]?.location_id || '';

                    return (
                      <TableRow key={lineItem.id} className="border-gray-700">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {part?.featured_photo && (
                              <img 
                                src={part.featured_photo} 
                                alt="" 
                                className="w-10 h-10 rounded object-cover bg-gray-700"
                              />
                            )}
                            <div>
                              <p className="text-white font-medium">{part?.part_name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{part?.vendor_part_number}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-white">{ordered}</TableCell>
                        <TableCell className="text-center">
                          <span className={received >= ordered ? 'text-green-400' : 'text-blue-400'}>
                            {received}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {remaining > 0 ? (
                            <span className="text-yellow-400">{remaining}</span>
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell>
                          {remaining > 0 ? (
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              value={receivingQty || ''}
                              onChange={(e) => handleQtyChange(lineItem.id, e.target.value)}
                              placeholder="0"
                              className="w-20 h-8 text-center bg-gray-900 border-gray-600"
                            />
                          ) : (
                            <span className="text-gray-500 text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {remaining > 0 && receivingQty > 0 ? (
                            <Select
                              value={receivingLocation}
                              onValueChange={(v) => handleLocationChange(lineItem.id, v)}
                            >
                              <SelectTrigger className="h-8 bg-gray-900 border-gray-600">
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                {locations.map(loc => (
                                  <SelectItem key={loc.id} value={loc.id}>
                                    {loc.location_area}
                                    {loc.bin_description && ` - ${loc.bin_description}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-gray-500 text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        {totals.totalPending > 0 && (
          <div className="flex justify-end">
            <Button
              onClick={handleSubmitReceiving}
              disabled={isSubmitting || Object.values(receivingData).every(d => !d.qty)}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Submit Receiving
            </Button>
          </div>
        )}

        {/* Fully Received Message */}
        {isFullyReceived && (
          <Card className="bg-green-900/20 border-green-700">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
              <div>
                <p className="text-green-400 font-medium">Order Fully Received</p>
                <p className="text-sm text-gray-400">All items have been received into inventory.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MobileSafeAreaContainer>
  );
}