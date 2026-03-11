import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Truck,
  Search,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function POReceivingList({ 
  orders, 
  summary, 
  filterOptions, 
  isLoading, 
  onRefresh, 
  searchTerm, 
  onSearchChange, 
  vendorFilter, 
  onVendorFilterChange 
}) {
  const navigate = useNavigate();

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
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-white">{summary.total_orders || 0}</div>
              <div className="text-sm text-gray-400">Open Orders</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-400">{summary.total_lines || 0}</div>
              <div className="text-sm text-gray-400">Line Items</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-400">{summary.total_qty_remaining || 0}</div>
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
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700"
          />
        </div>
        <Select value={vendorFilter} onValueChange={onVendorFilterChange}>
          <SelectTrigger className="w-48 bg-gray-900 border-gray-700">
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {filterOptions?.vendors?.map(v => (
              <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {isLoading ? (
          <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-500 mx-auto" />
            <p className="text-gray-400 mt-2">Loading orders...</p>
          </Card>
        ) : orders?.length === 0 ? (
          <Card className="bg-gray-900/50 border-gray-700 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-white font-medium">All caught up!</p>
            <p className="text-gray-400 text-sm">No orders waiting to be received</p>
          </Card>
        ) : (
          orders?.map(po => {
            const openLines = po.open_lines ?? po.total_lines ?? 0;
            const isPartial = po.total_qty_received > 0 && po.total_qty_remaining > 0;
            const isUntouched = po.total_qty_received === 0;

            return (
              <Card 
                key={po.order_id} 
                className={cn(
                  "bg-gray-900/50 border-gray-700 hover:border-gray-600 cursor-pointer transition-colors",
                  isPartial && "border-l-4 border-l-amber-500",
                  isUntouched && "border-l-4 border-l-blue-500"
                )}
                onClick={() => navigate(createPageUrl('POReceiving') + `?order_id=${po.order_id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        isPartial ? "bg-amber-600/20" : "bg-blue-600/20"
                      )}>
                        <Package className={cn(
                          "w-5 h-5",
                          isPartial ? "text-amber-400" : "text-blue-400"
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{po.po_number}</span>
                          <Badge variant="outline" className={cn(
                            po.status === 'Ordered' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                            po.status === 'Partial' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                            po.status === 'Draft' && "bg-gray-500/20 text-gray-400 border-gray-500/30"
                          )}>
                            {po.status}
                          </Badge>
                          {isPartial && (
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
                              Partial
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-400">
                          {po.vendor_name} • {openLines} open / {po.total_lines} items
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-400">{po.total_qty_remaining}</div>
                      <div className="text-xs text-gray-500">to receive</div>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{po.total_qty_received} received</span>
                      <span>{po.total_qty_ordered} ordered</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all",
                          isPartial ? "bg-amber-500" : "bg-green-500"
                        )}
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
            );
          })
        )}
      </div>
    </div>
  );
}