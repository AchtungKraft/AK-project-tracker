import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, CheckCircle, MapPin, FileText, Tag, 
  ChevronDown, ChevronUp, Package, ExternalLink
} from "lucide-react";

/**
 * Inventory Compliance Report
 * Shows inventory items missing: receipt_id, location_id, source_type
 */
export default function InventoryComplianceReport({ onPartClick }) {
  const [expanded, setExpanded] = React.useState(false);

  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  // Calculate compliance issues
  const compliance = React.useMemo(() => {
    const missingLocation = [];
    const missingReceipt = [];
    const missingSourceType = [];
    const compliant = [];

    inventoryItems.forEach(item => {
      const issues = [];
      if (!item.location_id) issues.push('location');
      if (!item.receipt_id) issues.push('receipt');
      if (!item.source_type) issues.push('source_type');

      if (issues.length === 0) {
        compliant.push(item);
      } else {
        if (!item.location_id) missingLocation.push(item);
        if (!item.receipt_id) missingReceipt.push(item);
        if (!item.source_type) missingSourceType.push(item);
      }
    });

    const totalItems = inventoryItems.length;
    const compliantCount = compliant.length;
    const complianceRate = totalItems > 0 ? ((compliantCount / totalItems) * 100).toFixed(1) : 100;

    return {
      missingLocation,
      missingReceipt,
      missingSourceType,
      compliant,
      totalItems,
      compliantCount,
      complianceRate,
    };
  }, [inventoryItems]);

  const getPartName = (partId) => parts.find(p => p.id === partId)?.part_name || 'Unknown';
  const getLocationName = (locationId) => {
    const loc = locations.find(l => l.id === locationId);
    return loc ? `${loc.location_area}${loc.bin_description ? ` - ${loc.bin_description}` : ''}` : 'No Location';
  };

  const hasIssues = compliance.missingLocation.length > 0 || 
                   compliance.missingReceipt.length > 0 || 
                   compliance.missingSourceType.length > 0;

  if (isLoading) {
    return (
      <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
        <CardContent className="p-6 text-center text-gray-500">Loading compliance data...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )}
            Inventory Compliance
          </CardTitle>
          <Badge 
            variant="outline" 
            className={hasIssues ? "border-yellow-600 text-yellow-400" : "border-green-600 text-green-400"}
          >
            {compliance.complianceRate}% compliant
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={`p-2 rounded-lg ${compliance.missingLocation.length > 0 ? 'bg-red-900/30' : 'bg-gray-800/50'}`}>
            <MapPin className={`w-4 h-4 mx-auto mb-1 ${compliance.missingLocation.length > 0 ? 'text-red-400' : 'text-gray-500'}`} />
            <p className={`text-lg font-bold ${compliance.missingLocation.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {compliance.missingLocation.length}
            </p>
            <p className="text-xs text-gray-500">No Location</p>
          </div>
          <div className={`p-2 rounded-lg ${compliance.missingReceipt.length > 0 ? 'bg-orange-900/30' : 'bg-gray-800/50'}`}>
            <FileText className={`w-4 h-4 mx-auto mb-1 ${compliance.missingReceipt.length > 0 ? 'text-orange-400' : 'text-gray-500'}`} />
            <p className={`text-lg font-bold ${compliance.missingReceipt.length > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
              {compliance.missingReceipt.length}
            </p>
            <p className="text-xs text-gray-500">No Receipt</p>
          </div>
          <div className={`p-2 rounded-lg ${compliance.missingSourceType.length > 0 ? 'bg-yellow-900/30' : 'bg-gray-800/50'}`}>
            <Tag className={`w-4 h-4 mx-auto mb-1 ${compliance.missingSourceType.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`} />
            <p className={`text-lg font-bold ${compliance.missingSourceType.length > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {compliance.missingSourceType.length}
            </p>
            <p className="text-xs text-gray-500">No Source Type</p>
          </div>
        </div>

        {/* Expand/Collapse Details */}
        {hasIssues && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full text-gray-400 hover:text-white"
            >
              {expanded ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
              {expanded ? 'Hide Details' : 'Show Details'}
            </Button>

            {expanded && (
              <div className="space-y-3 pt-2 border-t border-gray-800">
                {/* Missing Location */}
                {compliance.missingLocation.length > 0 && (
                  <div>
                    <p className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Missing Location ({compliance.missingLocation.length})
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {compliance.missingLocation.slice(0, 10).map(item => (
                        <div 
                          key={item.id}
                          className="flex items-center justify-between p-2 bg-gray-800/50 rounded text-xs cursor-pointer hover:bg-gray-800"
                          onClick={() => onPartClick?.(parts.find(p => p.id === item.part_id))}
                        >
                          <span className="text-gray-300 truncate flex-1">{getPartName(item.part_id)}</span>
                          <span className="text-gray-500 ml-2">×{item.quantity_on_hand}</span>
                        </div>
                      ))}
                      {compliance.missingLocation.length > 10 && (
                        <p className="text-xs text-gray-500 text-center">
                          +{compliance.missingLocation.length - 10} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Missing Source Type */}
                {compliance.missingSourceType.length > 0 && (
                  <div>
                    <p className="text-xs text-yellow-400 font-medium mb-2 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Missing Source Type ({compliance.missingSourceType.length})
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {compliance.missingSourceType.slice(0, 10).map(item => (
                        <div 
                          key={item.id}
                          className="flex items-center justify-between p-2 bg-gray-800/50 rounded text-xs cursor-pointer hover:bg-gray-800"
                          onClick={() => onPartClick?.(parts.find(p => p.id === item.part_id))}
                        >
                          <span className="text-gray-300 truncate flex-1">{getPartName(item.part_id)}</span>
                          <span className="text-gray-500 ml-2">{getLocationName(item.location_id)}</span>
                        </div>
                      ))}
                      {compliance.missingSourceType.length > 10 && (
                        <p className="text-xs text-gray-500 text-center">
                          +{compliance.missingSourceType.length - 10} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!hasIssues && (
          <div className="text-center py-2">
            <CheckCircle className="w-8 h-8 mx-auto text-green-400 mb-2" />
            <p className="text-sm text-green-400">All inventory records are compliant</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}