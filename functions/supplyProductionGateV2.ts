import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SUPPLY PRODUCTION GATE V2
 * Final validation before allowing mutations
 * Returns detailed pass/fail status with blocking rules
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run integrity audit
    const auditResponse = await base44.functions.invoke('supplyIntegrityAudit', {});
    
    if (!auditResponse.data?.success) {
      return Response.json({
        success: false,
        gate_status: 'ERROR',
        message: 'Failed to run integrity audit',
        error: auditResponse.data?.error
      });
    }

    const audit = auditResponse.data.audit;
    
    // Build gate result
    const gates = {
      timestamp: new Date().toISOString(),
      
      // Gate 1: Pricing must be valid
      pricingGate: {
        description: 'All parts must have valid cost, all commitments must have valid pricing',
        status: audit.pricingIntegrity.status,
        violations_count: audit.pricingIntegrity.violations.length,
        blocking: audit.pricingIntegrity.status === 'FAIL'
      },
      
      // Gate 2: Commitment totals must match
      totalsGate: {
        description: 'Commitment financial totals must be derived correctly',
        status: audit.commitmentTotalsIntegrity.status,
        violations_count: audit.commitmentTotalsIntegrity.violations.length,
        blocking: audit.commitmentTotalsIntegrity.status === 'FAIL'
      },
      
      // Gate 3: Pool balances must be correct
      poolGate: {
        description: 'Pool balances must equal paid - allocated - charges',
        status: audit.poolIntegrity.status,
        violations_count: audit.poolIntegrity.violations.length,
        blocking: audit.poolIntegrity.status === 'FAIL'
      },
      
      // Gate 4: Lifecycle quantities must be valid
      lifecycleGate: {
        description: 'Quantity chain: installed ≤ received ≤ ordered ≤ committed',
        status: audit.lifecycleIntegrity.status,
        violations_count: audit.lifecycleIntegrity.violations.length,
        blocking: audit.lifecycleIntegrity.status === 'FAIL'
      },
      
      // Gate 5: No orphan references
      orphanGate: {
        description: 'All references must point to valid entities',
        status: audit.orphanIntegrity.status,
        violations_count: audit.orphanIntegrity.violations.length,
        blocking: audit.orphanIntegrity.status === 'FAIL'
      }
    };

    // Determine overall status
    const blocking_gates = Object.entries(gates)
      .filter(([key, gate]) => gate.blocking)
      .map(([key]) => key);
    
    const all_passed = blocking_gates.length === 0;
    
    // Generate recommendations
    const recommendations = [];
    
    if (gates.pricingGate.blocking) {
      recommendations.push({
        priority: 1,
        action: 'Run normalizeSupplyData with dry_run=true to preview fixes',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: true })"
      });
    }
    
    if (gates.totalsGate.blocking) {
      recommendations.push({
        priority: 2,
        action: 'Commitment totals are out of sync - normalization required',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: false })"
      });
    }
    
    if (gates.poolGate.blocking) {
      recommendations.push({
        priority: 3,
        action: 'Pool balances need reconciliation',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: false })"
      });
    }
    
    if (gates.lifecycleGate.blocking) {
      recommendations.push({
        priority: 4,
        action: 'Lifecycle quantities are invalid - needs correction',
        command: "base44.functions.invoke('normalizeSupplyData', { dry_run: false })"
      });
    }
    
    if (gates.orphanGate.blocking) {
      recommendations.push({
        priority: 5,
        action: 'Orphan records detected - manual review required',
        manual: true
      });
    }

    return Response.json({
      success: true,
      gate_status: all_passed ? 'PASS' : 'FAIL',
      execution_surface_ready: all_passed,
      
      gates,
      blocking_gates,
      
      recommendations: recommendations.sort((a, b) => a.priority - b.priority),
      
      summary: {
        total_gates: 5,
        passed: 5 - blocking_gates.length,
        failed: blocking_gates.length,
        message: all_passed 
          ? 'All gates passed. Execution surface is ready for mutations.'
          : `${blocking_gates.length} gate(s) failed. Run normalizeSupplyData to repair data.`
      },
      
      // Include raw audit for debugging
      raw_audit_summary: audit.summary
    });

  } catch (error) {
    console.error('Production gate error:', error);
    return Response.json({ 
      success: false,
      gate_status: 'ERROR',
      error: error.message 
    }, { status: 500 });
  }
});