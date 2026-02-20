import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * POCostReviewCard - Forward Model Only
 * Shows PO lines where cost_requires_review === true
 * Phase 6.1: Surface for reviewing PO lines with $0 or missing costs
 */
export default function POCostReviewCard({ projectId }) {
  // Fetch PO lines needing cost review
  const { data: reviewLines = [], isLoading } = useQuery({
    queryKey: ['po-cost-review', projectId],
    queryFn: async () => {
      // Filter by project if provided, otherwise get all
      const filter = { cost_requires_review: true };
      if (projectId) {
        // Need to get orders for this project first, then filter lines
        const commitments = await base44.entities.PartCommitment.filter({ project_id: projectId });
        const commitmentIds = commitments.map(c => c.id);
        
        // Get all PO lines
        const allLines = await base44.entities.PartPurchaseLineItem.filter({ cost_requires_review: true });
        
        // Filter to only lines linked to project commitments
        return allLines.filter(l => commitmentIds.includes(l.commitment_id));
      } else {
        return base44.entities.PartPurchaseLineItem.filter(filter);
      }
    },
    staleTime: 60000,
  });

  // Enrich with part/order data
  const { data: parts = [] } = useQuery({
    queryKey: ['parts-for-review', reviewLines.map(l => l.part_id).join(',')],
    queryFn: () => base44.entities.Part.list(),
    enabled: reviewLines.length > 0,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-for-review', reviewLines.map(l => l.order_id).join(',')],
    queryFn: () => base44.entities.Order.list(),
    enabled: reviewLines.length > 0,
  });

  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
  const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));

  const enrichedLines = reviewLines.map(line => ({
    ...line,
    part: partsMap[line.part_id],
    order: ordersMap[line.order_id],
  }));

  if (isLoading) {
    return (
      <Card className="bg-orange-900/20 border-orange-800/50">
        <CardContent className="p-4">
          <div className="animate-pulse h-16 bg-orange-900/30 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (reviewLines.length === 0) {
    return null; // Don't show card if no items need review
  }

  return (
    <Card className="bg-orange-900/20 border-orange-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-orange-400 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            PO Lines Needing Cost Review
          </CardTitle>
          <Badge className="bg-orange-600 text-white">
            {reviewLines.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-gray-400 mb-3">
          These PO lines have $0 or missing costs and require manual review.
        </p>
        
        {/* Show first 3 items */}
        <div className="space-y-2 mb-3">
          {enrichedLines.slice(0, 3).map(line => (
            <div 
              key={line.id} 
              className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white truncate">
                  {line.part?.part_name || 'Unknown Part'}
                </p>
                <p className="text-xs text-gray-500">
                  PO: {line.order?.po_number || 'N/A'} • Qty: {line.qty_ordered}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-red-600/30 text-red-400 text-xs">
                  ${(line.unit_cost || 0).toFixed(2)}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {reviewLines.length > 3 && (
          <p className="text-xs text-gray-500 mb-3">
            +{reviewLines.length - 3} more items
          </p>
        )}

        <Link to={`${createPageUrl('POReceiving')}?filter=cost_review`}>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full border-orange-700 text-orange-400 hover:bg-orange-900/30"
          >
            <DollarSign className="w-3 h-3 mr-1" />
            Review All Costs
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}