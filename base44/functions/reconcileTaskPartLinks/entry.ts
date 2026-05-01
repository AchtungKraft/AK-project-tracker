import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * reconcileTaskPartLinks — One-time backfill & ongoing reconciliation
 * 
 * Syncs TaskPartLink.qty_installed / install_status from PartCommitment state.
 * Fixes historical drift where install actions updated commitments but not TaskPartLinks.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json();

    // Fetch all TaskPartLinks that have a commitment_id
    const allLinks = await base44.asServiceRole.entities.TaskPartLink.list();
    const linksWithCommitment = allLinks.filter(l => l.commitment_id);

    if (linksWithCommitment.length === 0) {
      return Response.json({ message: 'No TaskPartLinks with commitments found', updated: 0 });
    }

    // Fetch all referenced commitments
    const commitmentIds = [...new Set(linksWithCommitment.map(l => l.commitment_id))];
    const allCommitments = [];
    // Batch fetch in chunks
    for (let i = 0; i < commitmentIds.length; i += 50) {
      const chunk = commitmentIds.slice(i, i + 50);
      const results = await base44.asServiceRole.entities.PartCommitment.filter({ id: { $in: chunk } });
      allCommitments.push(...results);
    }
    const commitmentMap = Object.fromEntries(allCommitments.map(c => [c.id, c]));

    const updates = [];
    const skipped = [];

    for (const link of linksWithCommitment) {
      const commitment = commitmentMap[link.commitment_id];
      if (!commitment) {
        skipped.push({ link_id: link.id, reason: 'commitment_not_found' });
        continue;
      }

      const tplRequired = link.qty_allocated ?? 1;
      const commitInstalled = commitment.qty_installed ?? 0;
      const commitStatus = commitment.commitment_status;

      // Derive expected TaskPartLink state from commitment
      let expectedInstalled, expectedStatus;
      if (commitStatus === 'installed' || commitInstalled >= (commitment.required_total ?? 1)) {
        expectedInstalled = tplRequired; // fully installed
        expectedStatus = 'complete';
      } else if (commitInstalled > 0) {
        expectedInstalled = Math.min(commitInstalled, tplRequired);
        expectedStatus = expectedInstalled >= tplRequired ? 'complete' : 'partial';
      } else {
        expectedInstalled = 0;
        expectedStatus = 'pending';
      }

      const currentInstalled = link.qty_installed ?? 0;
      const currentStatus = link.install_status ?? 'pending';

      if (currentInstalled !== expectedInstalled || currentStatus !== expectedStatus) {
        updates.push({
          link_id: link.id,
          task_id: link.task_id,
          part_id: link.part_id,
          commitment_id: link.commitment_id,
          old: { qty_installed: currentInstalled, install_status: currentStatus },
          new: { qty_installed: expectedInstalled, install_status: expectedStatus },
          commitment_state: { qty_installed: commitInstalled, status: commitStatus },
        });
      }
    }

    if (!dry_run && updates.length > 0) {
      for (const u of updates) {
        await base44.asServiceRole.entities.TaskPartLink.update(u.link_id, {
          qty_installed: u.new.qty_installed,
          install_status: u.new.install_status,
          ...(u.new.install_status === 'complete' ? { installed_at: new Date().toISOString() } : {}),
        });
      }
    }

    return Response.json({
      success: true,
      dry_run,
      total_links: allLinks.length,
      links_with_commitments: linksWithCommitment.length,
      links_needing_update: updates.length,
      skipped: skipped.length,
      updated: dry_run ? 0 : updates.length,
      details: updates.slice(0, 20), // Show first 20 for review
    });
  } catch (error) {
    console.error('reconcileTaskPartLinks error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});