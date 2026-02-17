import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ShoppingCart, Package, Truck, CheckCircle2, AlertTriangle, Eye
} from "lucide-react";

/**
 * ProjectSupplyDashboard - Portfolio-level supply chain overview
 * 
 * STRICT ENGINE REUSE:
 * - Uses ONLY precomputed commitment fields (exposure_gap, covered_retail_total, etc.)
 * - NO UI-side financial calculations
 * - Drilldowns route to pages that use CommitmentActions
 */
export default function ProjectSupplyDashboard({ projects, statuses }) {
  const navigate = useNavigate();

  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.list()
  });

  const { data: pools = [] } = useQuery({
    queryKey: ['billingPools'],
    queryFn: () => base44.entities.BillingPool.list()
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list()
  });

  // Calculate supply metrics per project
  const projectMetrics = useMemo(() => {
    return projects.map(project => {
      const projectCommitments = commitments.filter(c => c.project_id === project.id && c.commitment_status !== 'cancelled');
      const projectPools = pools.filter(p => p.project_id === project.id);
      const projectLineItems = lineItems.filter(li => {
        const commitment = commitments.find(c => c.id === li.commitment_id);
        return commitment?.project_id === project.id;
      });

      // Count by status
      const planned = projectCommitments.filter(c => c.commitment_status === 'planned').length;
      const ordered = projectCommitments.filter(c => ['ordered', 'partially_received'].includes(c.commitment_status)).length;
      const received = projectCommitments.filter(c => c.commitment_status === 'received').length;
      const installed = projectCommitments.filter(c => c.commitment_status === 'installed').length;
      const total = projectCommitments.length;

      // STRICT: Financial metrics from PRECOMPUTED fields ONLY
      const totalExposure = projectCommitments.reduce((sum, c) => sum + (c.exposure_gap || 0), 0);
      const totalPlannedRetail = projectCommitments.reduce((sum, c) => sum + (c.planned_retail_total || 0), 0);
      const totalCovered = projectCommitments.reduce((sum, c) => sum + (c.covered_retail_total || 0), 0);
      const poolBalance = projectPools.reduce((sum, p) => sum + (p.balance || 0), 0);
      // NOTE: No derived calculations - all values come from entity fields

      // Open POs (not fully received)
      const openPOs = new Set(
        projectLineItems
          .filter(li => (li.qty_ordered || 0) > (li.qty_received || 0))
          .map(li => li.order_id)
      ).size;

      // Progress
      const progressPct = total > 0 ? Math.round((installed / total) * 100) : 0;

      // Need to order
      const needsOrder = projectCommitments.filter(c => 
        c.commitment_status === 'planned' || 
        (c.qty_committed || 0) > (c.qty_ordered || 0)
      ).length;

      return {
        project,
        planned,
        ordered,
        received,
        installed,
        total,
        totalExposure,
        totalPlannedRetail,
        totalCovered,
        poolBalance,
        openPOs,
        progressPct,
        needsOrder,
      };
    });
  }, [projects, commitments, pools, lineItems]);

  const handleDrilldown = (projectId, view) => {
    switch (view) {
      case 'supply':
        navigate(createPageUrl(`ProjectDetail?id=${projectId}&tab=parts`));
        break;
      case 'needs_order':
        navigate(createPageUrl(`GlobalNeedToOrder?project_id=${projectId}`));
        break;
      case 'financial':
        navigate(createPageUrl(`ProjectDetail?id=${projectId}&tab=parts&view=financial`));
        break;
      case 'open_pos':
        navigate(createPageUrl(`GlobalNeedToOrder?project_id=${projectId}&state=ordered`));
        break;
      default:
        navigate(createPageUrl(`ProjectDetail?id=${projectId}&tab=parts`));
    }
  };

  // Portfolio totals
  const totals = useMemo(() => ({
    totalProjects: projectMetrics.length,
    totalCommitments: projectMetrics.reduce((sum, p) => sum + p.total, 0),
    totalNeedsOrder: projectMetrics.reduce((sum, p) => sum + p.needsOrder, 0),
    totalExposure: projectMetrics.reduce((sum, p) => sum + p.totalExposure, 0),
    totalOpenPOs: projectMetrics.reduce((sum, p) => sum + p.openPOs, 0),
  }), [projectMetrics]);

  return (
    <div className="space-y-4">
      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Active Projects</p>
            <p className="text-2xl font-bold text-white">{totals.totalProjects}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Total Commitments</p>
            <p className="text-2xl font-bold text-blue-400">{totals.totalCommitments}</p>
          </CardContent>
        </Card>
        <Card 
          className="bg-black/40 border-red-900/30 cursor-pointer hover:bg-red-900/10 transition-colors"
          onClick={() => navigate(createPageUrl('GlobalNeedToOrder'))}
        >
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Needs Order</p>
            <p className="text-2xl font-bold text-red-400">{totals.totalNeedsOrder}</p>
            <p className="text-xs text-gray-400">→ View Queue</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Open POs</p>
            <p className="text-2xl font-bold text-yellow-400">{totals.totalOpenPOs}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-gray-500">Total Exposure</p>
            <p className="text-2xl font-bold text-red-400">${totals.totalExposure.toFixed(0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Project Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projectMetrics.map(({ project, ...metrics }) => {
          const status = statuses?.find(s => s.id === project.status_id);

          return (
            <Card 
              key={project.id} 
              className="bg-black/40 border-gray-800 hover:border-red-900/50 transition-colors"
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-white text-base truncate">{project.name}</CardTitle>
                    {project.client_name && (
                      <p className="text-xs text-gray-400 truncate">{project.client_name}</p>
                    )}
                  </div>
                  {status && (
                    <Badge style={{ backgroundColor: status.color }} className="text-white text-xs shrink-0">
                      {status.label}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-0 space-y-3">
                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Install Progress</span>
                    <span className="text-white">{metrics.progressPct}%</span>
                  </div>
                  <Progress value={metrics.progressPct} className="h-1.5" />
                </div>

                {/* Status Counts - Clickable */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div 
                    className="p-1.5 bg-gray-800/50 rounded cursor-pointer hover:bg-gray-700/50 transition-colors"
                    onClick={() => handleDrilldown(project.id, 'supply')}
                  >
                    <Package className="w-3.5 h-3.5 mx-auto text-gray-400 mb-0.5" />
                    <p className="text-xs text-gray-500">Planned</p>
                    <p className="text-sm font-bold text-gray-300">{metrics.planned}</p>
                  </div>
                  <div 
                    className="p-1.5 bg-yellow-900/20 rounded cursor-pointer hover:bg-yellow-900/30 transition-colors"
                    onClick={() => handleDrilldown(project.id, 'open_pos')}
                  >
                    <Truck className="w-3.5 h-3.5 mx-auto text-yellow-400 mb-0.5" />
                    <p className="text-xs text-gray-500">Ordered</p>
                    <p className="text-sm font-bold text-yellow-400">{metrics.ordered}</p>
                  </div>
                  <div 
                    className="p-1.5 bg-blue-900/20 rounded cursor-pointer hover:bg-blue-900/30 transition-colors"
                    onClick={() => handleDrilldown(project.id, 'supply')}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mx-auto text-blue-400 mb-0.5" />
                    <p className="text-xs text-gray-500">Received</p>
                    <p className="text-sm font-bold text-blue-400">{metrics.received}</p>
                  </div>
                  <div 
                    className="p-1.5 bg-green-900/20 rounded cursor-pointer hover:bg-green-900/30 transition-colors"
                    onClick={() => handleDrilldown(project.id, 'supply')}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mx-auto text-green-400 mb-0.5" />
                    <p className="text-xs text-gray-500">Installed</p>
                    <p className="text-sm font-bold text-green-400">{metrics.installed}</p>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded">
                  <div className="flex items-center gap-3">
                    {metrics.needsOrder > 0 && (
                      <div 
                        className="flex items-center gap-1 cursor-pointer hover:text-red-300 transition-colors"
                        onClick={() => handleDrilldown(project.id, 'needs_order')}
                      >
                        <ShoppingCart className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs text-red-400 font-medium">{metrics.needsOrder} need order</span>
                      </div>
                    )}
                    {metrics.totalExposure > 0 && (
                      <div 
                        className="flex items-center gap-1 cursor-pointer hover:text-yellow-300 transition-colors"
                        onClick={() => handleDrilldown(project.id, 'financial')}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-xs text-yellow-400">${metrics.totalExposure.toFixed(0)}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-gray-400 hover:text-white"
                    onClick={() => handleDrilldown(project.id, 'supply')}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}