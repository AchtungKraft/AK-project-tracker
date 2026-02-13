import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9.5 — Lifecycle Drift Detection
 * 
 * Scheduled validator that checks for coverage and validation issues.
 * Triggers LifecycleDriftDetected event if problems found.
 */

async function runLifecycleDriftCheck(base44) {
  const driftResults = {
    coverage_pct: 100,
    validation_failures: 0,
    drift_detected: false,
    drift_summary: [],
    failing_commitments: [],
    checked_at: new Date().toISOString(),
  };

  try {
    // Run coverage diagnostic
    const coverageResponse = await base44.functions.invoke('diagnoseActionWorkbenchCoverage', {
      options: { limit: 20 }
    });
    const coverageData = coverageResponse.data;

    if (coverageData?.kpis) {
      driftResults.coverage_pct = coverageData.kpis.coverage_percentage || 0;
      
      if (driftResults.coverage_pct < 95) {
        driftResults.drift_detected = true;
        driftResults.drift_summary.push({
          type: 'LOW_COVERAGE',
          message: `Coverage at ${driftResults.coverage_pct}% (threshold: 95%)`,
          missing_count: coverageData.kpis.total_missing || 0,
        });
        
        // Add failing commitments
        if (coverageData.missing_commitments) {
          driftResults.failing_commitments = coverageData.missing_commitments.map(c => ({
            commitment_id: c.commitment_id,
            reason: c.reason,
            part_name: c.part_name,
            project_name: c.project_name,
          }));
        }
      }
      
      // Check for specific exclusion reasons that indicate problems
      const problematicReasons = [
        'missing_project_id',
        'project_not_found',
        'missing_part_id',
        'part_not_found',
      ];
      
      const reasonCounts = coverageData.reason_counts || {};
      for (const reason of problematicReasons) {
        if (reasonCounts[reason] > 0) {
          driftResults.drift_detected = true;
          driftResults.drift_summary.push({
            type: 'DATA_INTEGRITY',
            message: `${reasonCounts[reason]} commitments have ${reason.replace(/_/g, ' ')}`,
            count: reasonCounts[reason],
          });
        }
      }
    }

    // Run validation scenarios
    const validationResponse = await base44.functions.invoke('validateLifecycleActionQueue', {});
    const validationData = validationResponse.data;

    if (validationData?.scenarios) {
      const failures = validationData.scenarios.filter(s => !s.pass);
      driftResults.validation_failures = failures.length;
      
      if (failures.length > 0) {
        driftResults.drift_detected = true;
        failures.forEach(f => {
          driftResults.drift_summary.push({
            type: 'VALIDATION_FAILURE',
            message: `Scenario failed: ${f.scenario}`,
            details: f.details?.slice(0, 3),
          });
        });
      }
    }

    // Create LifecycleEvent if drift detected
    if (driftResults.drift_detected) {
      try {
        await base44.asServiceRole.entities.LifecycleEvent.create({
          commitment_id: 'SYSTEM',
          event_type: 'STATUS_OVERRIDE', // Using existing enum value
          trigger_source: 'SYSTEM_AUTOMATION',
          notes: JSON.stringify({
            drift_type: 'LifecycleDriftDetected',
            coverage_pct: driftResults.coverage_pct,
            validation_failures: driftResults.validation_failures,
            summary: driftResults.drift_summary,
          }),
        });
      } catch (eventError) {
        console.error('Failed to create drift event:', eventError);
      }
    }

  } catch (error) {
    console.error('Drift check error:', error);
    driftResults.drift_detected = true;
    driftResults.drift_summary.push({
      type: 'CHECK_ERROR',
      message: error.message,
    });
  }

  return driftResults;
}

// ============================================
// HTTP ENDPOINT
// ============================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const result = await runLifecycleDriftCheck(base44);
    
    return Response.json(result);
    
  } catch (error) {
    console.error('Drift check error:', error);
    return Response.json({ 
      error: error.message,
      code: 'DRIFT_CHECK_ERROR'
    }, { status: 500 });
  }
});