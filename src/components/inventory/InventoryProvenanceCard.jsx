import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Truck, User, Car, FileEdit, ArrowRightLeft, Cog, Package, 
  HelpCircle, TrendingUp 
} from "lucide-react";

const SOURCE_CONFIG = {
  vendor_order: { label: "Vendor Orders", icon: Truck, color: "text-blue-400", bg: "bg-blue-900/30" },
  client_supplied: { label: "Client Supplied", icon: User, color: "text-purple-400", bg: "bg-purple-900/30" },
  vehicle_removed: { label: "Vehicle Removed", icon: Car, color: "text-orange-400", bg: "bg-orange-900/30" },
  manual_entry: { label: "Manual Entries", icon: FileEdit, color: "text-gray-400", bg: "bg-gray-800/50" },
  internal_transfer: { label: "Internal Transfer", icon: ArrowRightLeft, color: "text-cyan-400", bg: "bg-cyan-900/30" },
  material_conversion: { label: "Material Conversion", icon: Cog, color: "text-green-400", bg: "bg-green-900/30" },
  unknown: { label: "Unknown/Legacy", icon: HelpCircle, color: "text-yellow-400", bg: "bg-yellow-900/30" },
};

export default function InventoryProvenanceCard() {
  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // Calculate provenance breakdown
  const provenance = React.useMemo(() => {
    const breakdown = {};
    let totalQuantity = 0;
    let totalItems = 0;

    inventoryItems.forEach(item => {
      const sourceType = item.source_type || 'unknown';
      if (!breakdown[sourceType]) {
        breakdown[sourceType] = { count: 0, quantity: 0 };
      }
      breakdown[sourceType].count += 1;
      breakdown[sourceType].quantity += item.quantity_on_hand || 0;
      totalQuantity += item.quantity_on_hand || 0;
      totalItems += 1;
    });

    return { breakdown, totalQuantity, totalItems };
  }, [inventoryItems]);

  if (isLoading) {
    return (
      <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
        <CardContent className="p-6 text-center text-gray-500">Loading...</CardContent>
      </Card>
    );
  }

  const sortedSources = Object.entries(provenance.breakdown)
    .sort((a, b) => b[1].quantity - a[1].quantity);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-400" />
          Inventory Provenance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Total Inventory</span>
          <div className="text-right">
            <span className="text-white font-medium">{provenance.totalQuantity.toLocaleString()}</span>
            <span className="text-gray-500 ml-1">units</span>
            <span className="text-gray-600 mx-1">·</span>
            <span className="text-gray-400">{provenance.totalItems}</span>
            <span className="text-gray-500 ml-1">records</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2 pt-2 border-t border-gray-800">
          {sortedSources.map(([sourceType, data]) => {
            const config = SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.unknown;
            const Icon = config.icon;
            const percentage = provenance.totalQuantity > 0 
              ? ((data.quantity / provenance.totalQuantity) * 100).toFixed(1) 
              : 0;

            return (
              <div 
                key={sourceType} 
                className={`flex items-center justify-between p-2 rounded-lg ${config.bg}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${config.color}`} />
                  <span className="text-sm text-gray-200">{config.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                    {data.count} records
                  </Badge>
                  <div className="text-right min-w-[80px]">
                    <span className={`font-medium ${config.color}`}>{data.quantity.toLocaleString()}</span>
                    <span className="text-gray-500 text-xs ml-1">({percentage}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {sortedSources.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No inventory data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}