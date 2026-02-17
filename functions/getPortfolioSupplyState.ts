import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getPortfolioSupplyState - Canonical read model for portfolio-level supply metrics
 * 
 * Returns precomputed metrics per project:
 * - Commitment lifecycle summaries
 * - Financial exposure and coverage
 * - Pool balances and status
 * - Installation progress
 * - Alert flags
 * 
 * UI must NOT calculate any of these - render only.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all required entities
    const [projects, statuses, projectTypes, commitments, pools, lineItems, installedParts] = await Promise.all([
      base44.entities.Project.list(),
      base44.entities.StatusList.list(),
      base44.entities.ProjectType.list(),
      base44.entities.PartCommitment.list(),
      base44.entities.BillingPool.list(),
      base44.entities.PartPurchaseLineItem.list(),
      base44.entities.InstalledPart.list(),
    ]);

    // Build project metrics
    const projectMetrics = projects.map(project => {
      const projectCommitments = commitments.filter(c => c.project_id === project.id && c.commitment_status !== 'cancelled');
      const projectPools = pools.filter(p => p.project_id === project.id);
      const projectLineItems = lineItems.filter(li => projectCommitments.some(c => c.id === li.commitment_id));
      const projectInstalled = installedParts.filter(ip => ip.project_id === project.id && !ip.is_reversed);

      // Commitment lifecycle counts
      const statusCounts = {
        planned: 0,
        ordered: 0,
        partially_received: 0,
        received: 0,
        allocated: 0,
        installed: 0,
      };
      
      projectCommitments.forEach(c => {
        if (statusCounts[c.commitment_status] !== undefined) {
          statusCounts[c.commitment_status]++;
        }
      });

      // Financial calculations
      let totalExposure = 0;
      let totalCoveredRetail = 0;
      let totalPlannedRetail = 0;
      let totalQtyCommitted = 0;
      let totalQtyOrdered = 0;
      let totalQtyReceived = 0;
      let totalQtyInstalled = 0;

      projectCommitments.forEach(c => {
        const exposure = c.exposure_gap || 0;
        const covered = c.covered_retail_total || 0;
        const planned = c.planned_retail_total || 0;
        
        totalExposure += exposure;
        totalCoveredRetail += covered;
        totalPlannedRetail += planned;
        totalQtyCommitted += c.qty_committed || 0;
        totalQtyOrdered += c.qty_ordered || 0;
        totalQtyReceived += c.qty_received || 0;
        totalQtyInstalled += c.qty_installed || 0;
      });

      // Pool calculations
      let totalPoolBalance = 0;
      let totalPoolAllocated = 0;
      let hasOverdrawnPool = false;
      let activePools = 0;

      projectPools.forEach(p => {
        if (p.status !== 'closed') {
          totalPoolBalance += p.balance || 0;
          totalPoolAllocated += p.allocated_amount || 0;
          activePools++;
          if ((p.balance || 0) < 0 || p.status === 'overdrawn') {
            hasOverdrawnPool = true;
          }
        }
      });

      // Derived metrics
      const coveragePercent = totalPlannedRetail > 0 
        ? Math.round((totalCoveredRetail / totalPlannedRetail) * 100) 
        : 0;
      
      const installPercent = totalQtyCommitted > 0 
        ? Math.round((totalQtyInstalled / totalQtyCommitted) * 100) 
        : 0;

      const needsOrder = projectCommitments.filter(c => 
        c.commitment_status === 'planned' || (c.qty_committed || 0) > (c.qty_ordered || 0)
      ).length;

      const onOrder = projectCommitments.filter(c => 
        ['ordered', 'partially_received'].includes(c.commitment_status)
      ).length;

      const readyToInstall = projectCommitments.filter(c => 
        (c.qty_received || 0) > (c.qty_installed || 0)
      ).length;

      // Funding block: exposure > pool balance
      const isFundingBlocked = totalExposure > totalPoolBalance && totalExposure > 0;

      // Alert flags
      const alerts = [];
      if (isFundingBlocked) alerts.push('FUNDING_BLOCKED');
      if (hasOverdrawnPool) alerts.push('POOL_OVERDRAWN');
      if (needsOrder > 0) alerts.push('NEEDS_ORDER');
      if (coveragePercent < 100 && totalPlannedRetail > 0) alerts.push('PARTIAL_COVERAGE');

      // Get status and type info
      const status = statuses.find(s => s.id === project.status_id);
      const projectType = projectTypes.find(t => t.id === project.project_type_id);

      return {
        project_id: project.id,
        project_name: project.name,
        client_name: project.client_name,
        status_id: project.status_id,
        status_label: status?.label || 'Unknown',
        status_color: status?.color || '#6B7280',
        project_type_id: project.project_type_id,
        project_type_name: projectType?.name || 'Unknown',
        featured_image_url: project.featured_image_url,
        
        // Commitment counts
        total_commitments: projectCommitments.length,
        status_counts: statusCounts,
        
        // Quantities
        qty_committed: totalQtyCommitted,
        qty_ordered: totalQtyOrdered,
        qty_received: totalQtyReceived,
        qty_installed: totalQtyInstalled,
        
        // Financial
        total_exposure: totalExposure,
        total_covered_retail: totalCoveredRetail,
        total_planned_retail: totalPlannedRetail,
        coverage_percent: coveragePercent,
        
        // Pools
        total_pool_balance: totalPoolBalance,
        total_pool_allocated: totalPoolAllocated,
        active_pools: activePools,
        has_overdrawn_pool: hasOverdrawnPool,
        
        // Progress
        install_percent: installPercent,
        
        // Action counts
        needs_order_count: needsOrder,
        on_order_count: onOrder,
        ready_to_install_count: readyToInstall,
        
        // Flags
        is_funding_blocked: isFundingBlocked,
        alerts,
      };
    });

    // Portfolio totals
    const portfolioTotals = {
      total_projects: projects.length,
      total_commitments: commitments.filter(c => c.commitment_status !== 'cancelled').length,
      total_exposure: projectMetrics.reduce((sum, p) => sum + p.total_exposure, 0),
      total_pool_balance: projectMetrics.reduce((sum, p) => sum + p.total_pool_balance, 0),
      total_needs_order: projectMetrics.reduce((sum, p) => sum + p.needs_order_count, 0),
      total_on_order: projectMetrics.reduce((sum, p) => sum + p.on_order_count, 0),
      total_ready_to_install: projectMetrics.reduce((sum, p) => sum + p.ready_to_install_count, 0),
      projects_with_alerts: projectMetrics.filter(p => p.alerts.length > 0).length,
      funding_blocked_count: projectMetrics.filter(p => p.is_funding_blocked).length,
    };

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      portfolio: portfolioTotals,
      projects: projectMetrics,
    });

  } catch (error) {
    console.error("getPortfolioSupplyState error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});