import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, Package, Building2, Plus, ExternalLink } from "lucide-react";

export default function PurchasingDashboard() {
  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list()
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  // Calculate parts that need to be ordered
  const partsToOrder = requirements
    .filter(req => {
      const toOrder = (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0);
      return toOrder > 0;
    })
    .map(req => {
      const part = parts.find(p => p.id === req.part_id) || {};
      const project = projects.find(p => p.id === req.project_id) || {};
      const vendor = vendors.find(v => v.id === part.default_vendor_id);
      const toOrder = (req.qty_needed || 0) - (req.qty_allocated || 0) - (req.qty_ordered || 0);
      
      return {
        ...req,
        part,
        project,
        vendor,
        qty_to_order: toOrder,
        estimated_cost: toOrder * (part.default_cost || 0)
      };
    });

  // Group by vendor
  const groupedByVendor = {};
  partsToOrder.forEach(item => {
    const vendorName = item.vendor?.vendor_name || 'No Vendor';
    const vendorId = item.vendor?.id || 'none';
    
    if (!groupedByVendor[vendorId]) {
      groupedByVendor[vendorId] = {
        vendor: item.vendor,
        vendorName,
        items: [],
        totalCost: 0
      };
    }
    groupedByVendor[vendorId].items.push(item);
    groupedByVendor[vendorId].totalCost += item.estimated_cost;
  });

  const totalPartsToOrder = partsToOrder.length;
  const totalEstimatedCost = partsToOrder.reduce((sum, p) => sum + p.estimated_cost, 0);

  return (
    <div className="space-y-4">
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Purchasing Dashboard</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-gray-900/50 rounded-lg border border-red-900/30">
              <p className="text-xs text-gray-400">Parts to Order</p>
              <p className="text-2xl font-bold text-red-400">{totalPartsToOrder}</p>
            </div>
            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400">Vendors</p>
              <p className="text-2xl font-bold text-white">{Object.keys(groupedByVendor).length}</p>
            </div>
            <div className="p-4 bg-gray-900/50 rounded-lg border border-yellow-900/30">
              <p className="text-xs text-gray-400">Estimated Total</p>
              <p className="text-2xl font-bold text-yellow-400">${totalEstimatedCost.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {totalPartsToOrder === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-green-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="text-green-400 font-medium">All caught up!</p>
            <p className="text-gray-500 text-sm">No parts need to be ordered right now</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedByVendor).map(([vendorId, group]) => (
          <Card key={vendorId} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <CardTitle className="text-white text-base">{group.vendorName}</CardTitle>
                  <Badge variant="outline" className="border-red-500 text-red-400">
                    {group.items.length} items
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-yellow-400 font-medium">
                    Est: ${group.totalCost.toFixed(2)}
                  </span>
                  {group.vendor?.website && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="border-gray-700 gap-1"
                      onClick={() => window.open(group.vendor.website, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Visit
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-xs">Part</TableHead>
                    <TableHead className="text-gray-400 text-xs">Project</TableHead>
                    <TableHead className="text-gray-400 text-xs text-center">Qty to Order</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Est. Cost</TableHead>
                    <TableHead className="text-gray-400 text-xs">Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map(item => (
                    <TableRow key={item.id} className="border-b border-red-900/10 hover:bg-red-950/20">
                      <TableCell>
                        <div>
                          <p className="text-white text-sm font-medium">{item.part.part_name}</p>
                          {item.part.vendor_part_number && (
                            <p className="text-xs text-gray-500 font-mono">{item.part.vendor_part_number}</p>
                          )}
                          {item.part.order_url && (
                            <a 
                              href={item.part.order_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" /> Order Link
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-300 text-sm">{item.project.name}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-red-400 font-bold">{item.qty_to_order}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-yellow-400">${item.estimated_cost.toFixed(2)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            item.priority === 'Critical' ? 'bg-red-600' :
                            item.priority === 'High' ? 'bg-orange-600' :
                            item.priority === 'Low' ? 'bg-gray-600' : 'bg-blue-600'
                          }
                        >
                          {item.priority || 'Normal'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}