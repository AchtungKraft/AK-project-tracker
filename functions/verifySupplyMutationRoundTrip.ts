import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * VERIFY SUPPLY MUTATION ROUND TRIP
 * Live test: executes a minimal safe scenario to verify mutations work end-to-end
 * 
 * Test flow:
 * 1. Find or use provided project with commitments
 * 2. Create a test pool (if needed)
 * 3. Allocate small amount to a planned commitment
 * 4. Verify read model updates correctly
 * 5. Optionally reverse the allocation to clean up
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { project_id, cleanup = true, test_amount = 10 } = body;

    const test = {
      timestamp: new Date().toISOString(),
      status: 'PASS',
      steps: [],
      diffs: {},
      errors: []
    };

    // Step 1: Find a project with planned commitments
    let targetProject = null;
    let targetCommitment = null;

    if (project_id) {
      const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
      targetProject = projects[0];
    }

    // Fetch all commitments and filter for planned status
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
    const plannedCommitments = allCommitments.filter(c => c.commitment_status === 'planned');

    if (!targetProject) {
      if (plannedCommitments.length === 0) {
        test.status = 'SKIP';
        test.errors.push('No planned commitments found to test');
        return Response.json({ success: true, test });
      }

      // Find a commitment with valid project_id
      for (const c of plannedCommitments) {
        if (c.project_id) {
          const projects = await base44.asServiceRole.entities.Project.filter({ id: c.project_id });
          if (projects.length > 0) {
            targetCommitment = c;
            targetProject = projects[0];
            break;
          }
        }
      }
    } else {
      const projectCommitments = plannedCommitments.filter(c => c.project_id === targetProject.id);
      targetCommitment = projectCommitments[0];
    }

    if (!targetProject || !targetCommitment) {
      test.status = 'SKIP';
      test.errors.push(`Could not find suitable project/commitment for test. plannedCommitments=${plannedCommitments.length}, targetProject=${!!targetProject}, targetCommitment=${!!targetCommitment}`);
      return Response.json({ success: true, test });
    }

    test.steps.push({
      step: 1,
      action: 'FIND_TARGET',
      result: 'PASS',
      details: {
        project_id: targetProject.id,
        project_name: targetProject.name,
        commitment_id: targetCommitment.id
      }
    });

    // Capture before state
    const beforeCommitment = { ...targetCommitment };
    const beforePools = await base44.asServiceRole.entities.BillingPool.filter({ 
      project_id: targetProject.id 
    });

    // Step 2: Ensure pool exists
    let testPool = beforePools.find(p => p.status !== 'closed');
    let createdPool = false;

    if (!testPool) {
      // Create test pool via CommitmentService
      const createResult = await base44.functions.invoke('commitmentService', {
        action: 'createBillingPool',
        project_id: targetProject.id,
        pool_name: 'Test Pool (Round Trip Verification)',
        invoiced_amount: 1000,
        notes: 'Created by verifySupplyMutationRoundTrip'
      });

      if (!createResult.data?.success) {
        test.status = 'FAIL';
        test.errors.push(`Failed to create pool: ${createResult.data?.error}`);
        return Response.json({ success: true, test });
      }

      testPool = createResult.data.pool;
      createdPool = true;

      // Mark pool as paid so we have balance
      await base44.asServiceRole.entities.BillingPool.update(testPool.id, {
        paid_amount: 1000,
        balance: 1000,
        status: 'paid'
      });

      test.steps.push({
        step: 2,
        action: 'CREATE_POOL',
        result: 'PASS',
        details: { pool_id: testPool.id, pool_name: testPool.pool_name }
      });
    } else {
      test.steps.push({
        step: 2,
        action: 'USE_EXISTING_POOL',
        result: 'PASS',
        details: { pool_id: testPool.id, pool_name: testPool.pool_name, balance: testPool.balance }
      });
    }

    // Step 3: Allocate funds to commitment
    const allocateResult = await base44.functions.invoke('commitmentService', {
      action: 'allocatePool',
      pool_id: testPool.id,
      commitment_id: targetCommitment.id,
      amount: test_amount,
      allocation_type: 'test',
      notes: 'Round trip verification test'
    });

    if (!allocateResult.data?.success) {
      test.status = 'FAIL';
      test.errors.push(`Allocation failed: ${allocateResult.data?.error}`);
      return Response.json({ success: true, test });
    }

    const allocationId = allocateResult.data.allocation?.id;

    test.steps.push({
      step: 3,
      action: 'ALLOCATE_POOL',
      result: 'PASS',
      details: {
        allocation_id: allocationId,
        amount: test_amount,
        overdraw: allocateResult.data.overdraw
      }
    });

    // Step 4: Verify read model updates
    await new Promise(r => setTimeout(r, 100)); // Small delay for consistency

    const afterCommitment = (await base44.asServiceRole.entities.PartCommitment.filter({ id: targetCommitment.id }))[0];
    const afterPool = (await base44.asServiceRole.entities.BillingPool.filter({ id: testPool.id }))[0];

    // Calculate diffs
    const coveredDiff = (afterCommitment.covered_retail_total || 0) - (beforeCommitment.covered_retail_total || 0);
    const exposureDiff = (afterCommitment.exposure_gap || 0) - (beforeCommitment.exposure_gap || 0);
    const poolAllocatedDiff = (afterPool.allocated_total || 0) - (testPool.allocated_total || 0);
    const poolBalanceDiff = (afterPool.balance || 0) - (testPool.balance || 0);

    test.diffs = {
      commitment: {
        covered_retail_total: { before: beforeCommitment.covered_retail_total, after: afterCommitment.covered_retail_total, diff: coveredDiff },
        exposure_gap: { before: beforeCommitment.exposure_gap, after: afterCommitment.exposure_gap, diff: exposureDiff }
      },
      pool: {
        allocated_total: { before: testPool.allocated_total, after: afterPool.allocated_total, diff: poolAllocatedDiff },
        balance: { before: testPool.balance, after: afterPool.balance, diff: poolBalanceDiff }
      }
    };

    // Verify expected changes
    const verificationErrors = [];
    
    if (Math.abs(coveredDiff - test_amount) > 0.01) {
      verificationErrors.push(`covered_retail_total did not increase by ${test_amount}: diff=${coveredDiff}`);
    }
    if (Math.abs(exposureDiff + test_amount) > 0.01 && beforeCommitment.exposure_gap > test_amount) {
      verificationErrors.push(`exposure_gap did not decrease by ${test_amount}: diff=${exposureDiff}`);
    }
    if (Math.abs(poolAllocatedDiff - test_amount) > 0.01) {
      verificationErrors.push(`pool.allocated_total did not increase by ${test_amount}: diff=${poolAllocatedDiff}`);
    }
    if (Math.abs(poolBalanceDiff + test_amount) > 0.01) {
      verificationErrors.push(`pool.balance did not decrease by ${test_amount}: diff=${poolBalanceDiff}`);
    }

    if (verificationErrors.length > 0) {
      test.status = 'FAIL';
      test.errors.push(...verificationErrors);
      test.steps.push({
        step: 4,
        action: 'VERIFY_DIFFS',
        result: 'FAIL',
        details: verificationErrors
      });
    } else {
      test.steps.push({
        step: 4,
        action: 'VERIFY_DIFFS',
        result: 'PASS',
        details: 'All expected changes verified'
      });
    }

    // Step 5: Cleanup (reverse allocation)
    if (cleanup && allocationId) {
      const reverseResult = await base44.functions.invoke('commitmentService', {
        action: 'reversePoolAllocation',
        allocation_id: allocationId,
        reason: 'Round trip test cleanup'
      });

      if (reverseResult.data?.success) {
        test.steps.push({
          step: 5,
          action: 'CLEANUP_REVERSE',
          result: 'PASS',
          details: 'Allocation reversed'
        });
      } else {
        test.steps.push({
          step: 5,
          action: 'CLEANUP_REVERSE',
          result: 'WARN',
          details: `Cleanup failed: ${reverseResult.data?.error}`
        });
      }

      // Delete test pool if we created it
      if (createdPool) {
        try {
          await base44.asServiceRole.entities.BillingPool.delete(testPool.id);
          test.steps.push({
            step: 6,
            action: 'CLEANUP_POOL',
            result: 'PASS',
            details: 'Test pool deleted'
          });
        } catch (e) {
          test.steps.push({
            step: 6,
            action: 'CLEANUP_POOL',
            result: 'WARN',
            details: `Pool cleanup failed: ${e.message}`
          });
        }
      }
    }

    // Summary
    test.summary = {
      total_steps: test.steps.length,
      passed: test.steps.filter(s => s.result === 'PASS').length,
      failed: test.steps.filter(s => s.result === 'FAIL').length,
      warnings: test.steps.filter(s => s.result === 'WARN').length,
      conclusion: test.status === 'PASS' 
        ? 'Mutation round trip verified successfully' 
        : `Verification failed: ${test.errors.join('; ')}`
    };

    return Response.json({
      success: true,
      test
    });

  } catch (error) {
    console.error('Round trip test error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});