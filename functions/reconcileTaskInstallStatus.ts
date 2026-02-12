import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RECONCILE TASK INSTALL STATUS
 * 
 * Verifies TaskPartLink.install_status matches InstalledPart totals.
 * Auto-corrects if drift detected.
 * 
 * Returns: { reconciled: number, errors: [], summary: {} }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { task_id, project_id, dry_run = true, auto_correct = false } = payload;

    const results = {
      checked: 0,
      correct: 0,
      reconciled: 0,
      errors: [],
      corrections: [],
    };

    // Fetch task part links
    let linkFilter = {};
    if (task_id) linkFilter.task_id = task_id;
    if (project_id) linkFilter.project_id = project_id;
    
    const taskPartLinks = Object.keys(linkFilter).length > 0
      ? await base44.asServiceRole.entities.TaskPartLink.filter(linkFilter)
      : await base44.asServiceRole.entities.TaskPartLink.list();

    // Fetch all installed parts
    const installedParts = await base44.asServiceRole.entities.InstalledPart.list();

    // Group installed parts by task_part_link_id
    const installedByLink = {};
    for (const ip of installedParts) {
      if (ip.task_part_link_id) {
        if (!installedByLink[ip.task_part_link_id]) {
          installedByLink[ip.task_part_link_id] = { total_qty: 0, records: [] };
        }
        installedByLink[ip.task_part_link_id].total_qty += (ip.qty_consumed || 0);
        installedByLink[ip.task_part_link_id].records.push(ip.id);
      }
    }

    // Check each link
    for (const link of taskPartLinks) {
      results.checked++;
      
      const installedData = installedByLink[link.id] || { total_qty: 0, records: [] };
      const actualInstalled = installedData.total_qty;
      const recordedInstalled = link.qty_installed || 0;
      const allocated = link.qty_allocated || 0;
      
      // Calculate expected status
      let expectedStatus = 'pending';
      if (actualInstalled >= allocated && allocated > 0) {
        expectedStatus = 'complete';
      } else if (actualInstalled > 0) {
        expectedStatus = 'partial';
      }

      // Check for drift
      const qtyDrift = actualInstalled !== recordedInstalled;
      const statusDrift = link.install_status !== expectedStatus;
      
      if (!qtyDrift && !statusDrift) {
        results.correct++;
        continue;
      }

      // Record drift
      const correction = {
        task_part_link_id: link.id,
        task_id: link.task_id,
        part_id: link.part_id,
        current_qty_installed: recordedInstalled,
        actual_qty_installed: actualInstalled,
        current_status: link.install_status,
        expected_status: expectedStatus,
        qty_drift: qtyDrift,
        status_drift: statusDrift,
      };

      // Auto-correct if enabled and not dry run
      if (auto_correct && !dry_run) {
        try {
          await base44.asServiceRole.entities.TaskPartLink.update(link.id, {
            qty_installed: actualInstalled,
            install_status: expectedStatus,
          });
          correction.corrected = true;
          results.reconciled++;
        } catch (e) {
          correction.corrected = false;
          correction.error = e.message;
          results.errors.push({
            task_part_link_id: link.id,
            error: e.message,
          });
        }
      } else {
        correction.corrected = false;
        correction.dry_run = dry_run;
      }

      results.corrections.push(correction);
    }

    return Response.json({
      success: true,
      dry_run,
      auto_correct,
      ...results,
      summary: {
        total_checked: results.checked,
        already_correct: results.correct,
        needs_correction: results.corrections.length,
        corrected: results.reconciled,
        errors: results.errors.length,
      },
      checked_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('reconcileTaskInstallStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});