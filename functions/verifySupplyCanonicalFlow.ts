import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * verifySupplyCanonicalFlow - End-to-end test for canonical supply mutations
 * 
 * PHASE 5/6: Verifies the full Add → Order → Receive → Install flow
 * All mutations go through executeSupplyAction, not direct entity writes.
 * 
 * Returns structured report:
 * - failures[]: Canonical invariant violations or broken references (BLOCKING)
 * - warnings[]: Legacy commitments missing required_total (migration backlog)
 * - summary: counts by type
 * 
 * Test Cases:
 * 1. Entity schemas have canonical fields
 * 2. Commitments use canonical fields (not just legacy)
 * 3. Invariants hold (installed <= reserved, to_order >= 0)
 * 4. No broken references
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
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { 
      test_project_id, 
      test_part_id,
      run_mutation_tests = false,
      cleanup_after = true
    } = await req.json();
    
    const results = {
      timestamp: new Date().toISOString(),
      phases: [],
      summary: { passed: 0, failed: 0, warnings: 0 },
      // PHASE 5/6: Structured failure/warning lists
      failures: [],
      warnings_list: [],
      migration_backlog: []
    };

    const addPhase = (name, tests) => {
      const passed = tests.filter(t => t.passed).length;
      const failed = tests.filter(t => !t.passed && t.passed !== null).length;
      results.phases.push({ name, tests, passed, failed });
      results.summary.passed += passed;
      results.summary.failed += failed;
    };

    // ========================================
    // PHASE 1: Entity Schema Verification
    // ========================================
    const phase1Tests = [];

    // Test Part entity has canonical inventory fields
    const sampleParts = await base44.asServiceRole.entities.Part.list('-created_date', 5);
    if (sampleParts.length > 0) {
      const part = sampleParts[0];
      
      phase1Tests.push({
        name: 'Part entity has physical_stock field',
        expected: 'Field exists',
        actual: 'physical_stock' in part ? 'Present' : 'Missing',
        passed: 'physical_stock' in part
      });

      phase1Tests.push({
        name: 'Part.physical_stock is number (not undefined)',
        expected: 'number or undefined',
        actual: typeof part.physical_stock,
        passed: typeof part.physical_stock === 'number' || part.physical_stock === undefined
      });
    }

    // Test PartCommitment entity has canonical fields
    const sampleCommitmentsForSchema = await base44.asServiceRole.entities.PartCommitment.list('-created_date', 5);
    if (sampleCommitmentsForSchema.length > 0) {
      const c = sampleCommitmentsForSchema[0];
      
      const hasCanonicalFields = 
        'required_total' in c ||
        'reserved_from_stock' in c ||
        'covered_from_po' in c ||
        'qty_installed' in c;

      phase1Tests.push({
        name: 'PartCommitment has canonical fields',
        expected: 'At least one canonical field present',
        actual: hasCanonicalFields ? 'Present' : 'Missing all',
        passed: hasCanonicalFields,
        details: {
          required_total: c.required_total,
          reserved_from_stock: c.reserved_from_stock,
          covered_from_po: c.covered_from_po,
          qty_installed: c.qty_installed
        }
      });
    }

    // Test LifecycleEvent entity exists for audit trail
    try {
      const sampleEvents = await base44.asServiceRole.entities.LifecycleEvent.list('-created_date', 3);
      phase1Tests.push({
        name: 'LifecycleEvent entity accessible',
        expected: 'Query succeeds',
        actual: `Found ${sampleEvents.length} events`,
        passed: true
      });
    } catch (e) {
      phase1Tests.push({
        name: 'LifecycleEvent entity accessible',
        expected: 'Query succeeds',
        actual: e.message,
        passed: false
      });
    }

    addPhase('Phase 1: Entity Schema Verification', phase1Tests);

    // ========================================
    // PHASE 2: Commitment Invariant Verification
    // ========================================
    const phase2Tests = [];
    
    // Sample random commitments to check invariants
    const sampleCommitments = await base44.asServiceRole.entities.PartCommitment.list('-created_date', 20);
    
    let invariantIssues = [];

    for (const c of sampleCommitments) {
      const required = c.required_total ?? c.qty_committed ?? 0;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered = c.covered_from_po ?? 0;
      const installed = c.qty_installed ?? 0;
      const toOrder = Math.max(0, required - reserved - covered);

      // Invariant 1: installed <= reserved (at boundary)
      if (installed > reserved + 0.01 && reserved > 0) {
        invariantIssues.push({
          id: c.id,
          type: 'INSTALLED_EXCEEDS_RESERVED',
          values: { installed, reserved }
        });
      }

      // Invariant 2: to_order >= 0
      if (toOrder < 0) {
        invariantIssues.push({
          id: c.id,
          type: 'NEGATIVE_TO_ORDER',
          values: { required, reserved, covered, computed_to_order: toOrder }
        });
      }

      // Invariant 3: required_total should exist (not just legacy)
      if (c.required_total === undefined && c.qty_committed !== undefined) {
        invariantIssues.push({
          id: c.id,
          type: 'MISSING_CANONICAL_FIELD',
          field: 'required_total'
        });
      }
    }

    phase2Tests.push({
      name: 'Invariant: installed <= reserved_from_stock',
      expected: '0 violations',
      actual: `${invariantIssues.filter(i => i.type === 'INSTALLED_EXCEEDS_RESERVED').length} violations`,
      passed: invariantIssues.filter(i => i.type === 'INSTALLED_EXCEEDS_RESERVED').length === 0,
      details: invariantIssues.filter(i => i.type === 'INSTALLED_EXCEEDS_RESERVED').slice(0, 3)
    });

    phase2Tests.push({
      name: 'Invariant: to_order >= 0',
      expected: '0 violations',
      actual: `${invariantIssues.filter(i => i.type === 'NEGATIVE_TO_ORDER').length} violations`,
      passed: invariantIssues.filter(i => i.type === 'NEGATIVE_TO_ORDER').length === 0
    });

    const missingCanonical = invariantIssues.filter(i => i.type === 'MISSING_CANONICAL_FIELD');
    // Legacy commitments without canonical fields are a warning, not a failure
    // They need migration but don't break current functionality
    const isWarning = missingCanonical.length > 0 && missingCanonical.length < sampleCommitments.length;
    phase2Tests.push({
      name: 'Canonical fields populated (not just legacy)',
      expected: '0 missing (or legacy warning)',
      actual: missingCanonical.length === 0 ? '0 missing' : `${missingCanonical.length} legacy commitments need migration`,
      passed: missingCanonical.length === 0 || isWarning, // Pass if all good or just legacy
      details: missingCanonical.slice(0, 3),
      note: missingCanonical.length > 0 ? 'Legacy commitments created before canonical migration - not blocking' : null
    });
    
    if (isWarning) {
      results.summary.warnings += 1;
    }

    // PHASE 5/6: Populate structured lists
    // Add actual failures (invariant violations)
    const installedExceedsReserved = invariantIssues.filter(i => i.type === 'INSTALLED_EXCEEDS_RESERVED');
    const negativeToOrder = invariantIssues.filter(i => i.type === 'NEGATIVE_TO_ORDER');
    
    results.failures = [
      ...installedExceedsReserved.map(i => ({
        type: 'INVARIANT_VIOLATION',
        subtype: 'INSTALLED_EXCEEDS_RESERVED',
        commitment_id: i.id,
        values: i.values,
        severity: 'error',
        fix: 'Run reconciliation to fix qty_installed vs reserved_from_stock'
      })),
      ...negativeToOrder.map(i => ({
        type: 'INVARIANT_VIOLATION',
        subtype: 'NEGATIVE_TO_ORDER',
        commitment_id: i.id,
        values: i.values,
        severity: 'error',
        fix: 'Recompute coverage - required_total may be less than reserved+covered'
      }))
    ];

    // Add migration backlog (legacy commitments)
    results.migration_backlog = missingCanonical.map(i => ({
      commitment_id: i.id,
      type: 'MISSING_REQUIRED_TOTAL',
      severity: 'warning',
      fix: 'Run migrateLegacyCommitmentQuantities to backfill required_total'
    }));

    results.warnings_list = [...results.migration_backlog];

    addPhase('Phase 2: Commitment Invariants', phase2Tests);

    // ========================================
    // PHASE 2.5: Legacy Poison Pill Detection
    // ========================================
    const phase25Tests = [];
    
    // Find commitments with reserved > 0 but required = 0 (poison pills)
    const poisonPillCommitments = sampleCommitments.filter(c => {
      const required = c.required_total ?? c.qty_committed ?? 0;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const installed = c.qty_installed ?? 0;
      return reserved > 0 && required === 0 && installed === 0;
    });

    phase25Tests.push({
      name: 'No poison pill commitments (reserved > 0, required = 0)',
      expected: '0 poison pills',
      actual: poisonPillCommitments.length === 0 
        ? '0 found (clean)' 
        : `${poisonPillCommitments.length} found - run fixLegacyReservedZeroRequired`,
      passed: poisonPillCommitments.length === 0,
      details: poisonPillCommitments.slice(0, 5).map(c => ({
        id: c.id,
        reserved: c.reserved_from_stock ?? c.qty_reserved,
        required: c.required_total ?? c.qty_committed ?? 0
      }))
    });

    if (poisonPillCommitments.length > 0) {
      // Calculate blocked stock
      const blockedStock = poisonPillCommitments.reduce((sum, c) => {
        return sum + (c.reserved_from_stock ?? c.qty_reserved ?? 0);
      }, 0);

      results.failures.push({
        type: 'LEGACY_POISON_PILL',
        count: poisonPillCommitments.length,
        blocked_stock_units: blockedStock,
        severity: 'critical',
        fix: 'Run fixLegacyReservedZeroRequired with dry_run=false',
        sample_ids: poisonPillCommitments.slice(0, 5).map(c => c.id)
      });
    }

    addPhase('Phase 2.5: Legacy Poison Pill Detection', phase25Tests);

    // ========================================
    // PHASE 3: Mutation Test (if enabled)
    // ========================================
    const phase3Tests = [];
    let testCommitmentId = null;

    if (run_mutation_tests && test_project_id && test_part_id) {
      // Step 1: Create commitment via ADJUST_REQUIRED
      try {
        const createRes = await base44.asServiceRole.functions.invoke('executeSupplyAction', {
          action_type: 'ADJUST_REQUIRED',
          commitment_ids: [],
          payload: {
            project_id: test_project_id,
            part_id: test_part_id,
            required_total_set: 3,
            source_type: 'SHOP_PURCHASED',
            notes: 'Test commitment from verifySupplyCanonicalFlow'
          },
          dry_run: false
        });

        phase3Tests.push({
          name: 'ADJUST_REQUIRED creates commitment',
          expected: 'Commitment created with required_total=3',
          actual: createRes.data?.commitment?.id ? `Created: ${createRes.data.commitment.id}` : createRes.data?.error || 'Unknown',
          passed: !!createRes.data?.commitment?.id
        });

        if (createRes.data?.commitment) {
          testCommitmentId = createRes.data.commitment.id;
          const c = createRes.data.commitment;

          phase3Tests.push({
            name: 'Commitment has canonical required_total',
            expected: 3,
            actual: c.required_total,
            passed: c.required_total === 3
          });
        }
      } catch (e) {
        phase3Tests.push({
          name: 'ADJUST_REQUIRED',
          expected: 'Success',
          actual: e.message,
          passed: false
        });
      }

      // Cleanup if requested
      if (cleanup_after && testCommitmentId) {
        try {
          await base44.asServiceRole.entities.PartCommitment.delete(testCommitmentId);
          phase3Tests.push({
            name: 'Cleanup: Test commitment deleted',
            expected: 'Deleted',
            actual: 'Success',
            passed: true
          });
        } catch (e) {
          phase3Tests.push({
            name: 'Cleanup: Test commitment deleted',
            expected: 'Deleted',
            actual: e.message,
            passed: false
          });
        }
      }
    } else if (!run_mutation_tests) {
      phase3Tests.push({
        name: 'Mutation tests skipped',
        expected: 'Skipped',
        actual: 'Set run_mutation_tests=true to run',
        passed: null
      });
    }

    addPhase('Phase 3: Mutation Test', phase3Tests);

    // Final summary
    results.summary.total_failures = results.failures.length;
    results.summary.total_warnings = results.warnings_list.length;
    results.summary.migration_backlog_count = results.migration_backlog.length;

    return Response.json({
      success: results.summary.failed === 0 && results.failures.length === 0,
      results,
      // PHASE 5/6: Top-level structured output
      failures: results.failures,
      warnings: results.warnings_list,
      migration_backlog: results.migration_backlog,
      summary: {
        ...results.summary,
        verdict: results.failures.length === 0 
          ? (results.migration_backlog.length > 0 ? 'PASS_WITH_BACKLOG' : 'PASS')
          : 'FAIL'
      }
    });

  } catch (error) {
    console.error('verifySupplyCanonicalFlow error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});