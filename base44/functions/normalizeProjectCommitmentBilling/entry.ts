import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * normalizeProjectCommitmentBilling - Phase 1 Ground Truth Commitment Financial Facts
 * 
 * For a given project_id, builds a deterministic "facts" structure per commitment
 * from canonical sources and optionally updates stale commitment fields.
 * 
 * CANONICAL SOURCES:
 * - ProjectInvoiceLine (by part_commitment_id) → invoiced_qty, invoiced_amount
 * - ProjectInvoice (status, paid_amount) → payment status
 * - CreditAllocation (by commitment_id) → credit applied
 * 
 * COMPUTES PER COMMITMENT:
 * - derived_invoiced_qty
 * - derived_invoiced_amount
 * - derived_credit_applied
 * - derived_paid_amount (proportional from invoice)
 * - derived_balance_due = derived_invoiced_amount - derived_credit_applied - derived_paid_amount
 * - derived_is_invoiced = derived_invoiced_amount > 0
 * - derived_is_paid = derived_is_invoiced && derived_balance_due <= 0
 * - derived_billing_status (unbilled | invoiced | paid)
 * 
 * SUPPLY FACTS:
 * - required_qty
 * - installed_qty
 * - available_to_allocate (from canonical inventory)
 * - installable_qty = max(0, min(available_to_allocate, reserved_from_stock - installed_qty))
 * - remaining_to_bill_qty = max(0, required_qty - derived_invoiced_qty)
 * 
 * OPTIONS:
 * - dry_run: If true, compute drift but don't update
 * - force_update: If true, update even if no drift detected
 * 
 * RETURNS:
 * - commitment_facts[]
 * - drift_report[] (stored vs derived mismatches)
 * - counts: { total, drifted, updated }
 * - sample_before_after (5 commitments)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ADMIN ONLY
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { project_id, dry_run = true, force_update = false } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Fetch all canonical sources in parallel
    const [
      commitments,
      projectInvoices,
      creditAllocations,
      parts,
    ] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.ProjectInvoice.filter({ project_id }),
      base44.entities.CreditAllocation.filter({ project_id, is_reversed: false }),
      base44.entities.Part.list('-created_date', 500),
    ]);

    // Fetch invoice lines for this project's invoices
    const invoiceIds = projectInvoices.map(inv => inv.id);
    const invoiceLines = invoiceIds.length > 0
      ? await base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIds } })
      : [];

    // Build lookup maps
    const invoiceById = new Map(projectInvoices.map(inv => [inv.id, inv]));
    const partMap = new Map(parts.map(p => [p.id, p]));

    // Compute paid ratio per invoice (for proportional payment attribution)
    const paidRatioByInvoice = new Map();
    for (const inv of projectInvoices) {
      if (inv.status === 'paid') {
        paidRatioByInvoice.set(inv.id, 1);
      } else if (inv.status === 'cancelled') {
        paidRatioByInvoice.set(inv.id, 0);
      } else if ((inv.paid_amount || 0) > 0 && (inv.total || 0) > 0) {
        paidRatioByInvoice.set(inv.id, Math.min(1, inv.paid_amount / inv.total));
      } else {
        paidRatioByInvoice.set(inv.id, 0);
      }
    }

    // Aggregate invoice lines by commitment
    const invoiceLinesByCommitment = new Map();
    for (const line of invoiceLines) {
      if (!line.part_commitment_id) continue;
      
      const invoice = invoiceById.get(line.invoice_id);
      if (!invoice || invoice.status === 'cancelled') continue;
      
      if (!invoiceLinesByCommitment.has(line.part_commitment_id)) {
        invoiceLinesByCommitment.set(line.part_commitment_id, []);
      }
      invoiceLinesByCommitment.get(line.part_commitment_id).push({
        ...line,
        invoice_status: invoice.status,
        paid_ratio: paidRatioByInvoice.get(line.invoice_id) ?? 0,
      });
    }

    // Aggregate credit allocations by commitment
    const creditByCommitment = new Map();
    for (const alloc of creditAllocations) {
      if (!alloc.commitment_id) continue;
      const current = creditByCommitment.get(alloc.commitment_id) ?? 0;
      creditByCommitment.set(alloc.commitment_id, current + (alloc.amount_applied || 0));
    }

    // Compute global inventory for available_to_allocate calculation
    const commitmentIds = commitments.map(c => c.id);
    const partIdsInProject = [...new Set(commitments.map(c => c.part_id))];
    
    // Fetch ALL commitments for parts (for global reserved calculation)
    const allCommitmentsForParts = partIdsInProject.length > 0
      ? await base44.entities.PartCommitment.filter({
          part_id: { $in: partIdsInProject },
          commitment_status: { $nin: ['cancelled', 'closed'] }
        })
      : [];

    // Build global inventory map
    const partInventoryMap = new Map();
    for (const partId of partIdsInProject) {
      const part = partMap.get(partId);
      partInventoryMap.set(partId, {
        physical_stock: part?.physical_stock ?? 0,
        reserved_global: 0,
      });
    }
    for (const c of allCommitmentsForParts) {
      const inv = partInventoryMap.get(c.part_id);
      if (!inv) continue;
      inv.reserved_global += c.reserved_from_stock ?? c.qty_reserved ?? 0;
    }
    for (const [partId, inv] of partInventoryMap.entries()) {
      inv.available = Math.max(0, inv.physical_stock - inv.reserved_global);
    }

    // Process each commitment
    const commitmentFacts = [];
    const driftReport = [];
    let driftedCount = 0;
    let updatedCount = 0;

    for (const c of commitments) {
      const lines = invoiceLinesByCommitment.get(c.id) || [];
      const part = partMap.get(c.part_id);
      const partInv = partInventoryMap.get(c.part_id) || { available: 0 };

      // === DERIVED FINANCIAL FACTS ===
      let derived_invoiced_qty = 0;
      let derived_invoiced_amount = 0;
      let derived_paid_amount = 0;

      for (const line of lines) {
        const lineQty = line.qty || 0;
        const lineTotal = line.line_total ?? (lineQty * (line.unit_price || 0));
        derived_invoiced_qty += lineQty;
        derived_invoiced_amount += lineTotal;
        derived_paid_amount += lineTotal * line.paid_ratio;
      }

      const derived_credit_applied = creditByCommitment.get(c.id) ?? 0;
      const derived_balance_due = Math.max(0, derived_invoiced_amount - derived_credit_applied - derived_paid_amount);
      const derived_is_invoiced = derived_invoiced_amount > 0;
      const derived_is_paid = derived_is_invoiced && derived_balance_due <= 0.01; // 1 cent tolerance

      let derived_billing_status;
      if (derived_is_paid) {
        derived_billing_status = 'paid';
      } else if (derived_is_invoiced) {
        derived_billing_status = 'invoiced';
      } else {
        derived_billing_status = 'unbilled';
      }

      // === SUPPLY FACTS ===
      const required_qty = c.required_total ?? c.qty_committed ?? 0;
      const installed_qty = c.qty_installed ?? 0;
      const reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      
      // Available to allocate = physical stock minus global reserved (can reallocate from global available)
      const available_to_allocate = partInv.available;
      
      // Installable = reserved but not yet installed
      const installable_qty = Math.max(0, reserved_from_stock - installed_qty);
      
      // Remaining to bill = required minus already invoiced
      const remaining_to_bill_qty = Math.max(0, required_qty - derived_invoiced_qty);

      // === DRIFT DETECTION ===
      const stored_invoiced_qty = c.invoiced_qty ?? 0;
      const stored_invoiced_amount = c.invoiced_amount ?? 0;
      const stored_billing_status = c.billing_status || 'unbilled';

      const qtyDrift = Math.abs(stored_invoiced_qty - derived_invoiced_qty) > 0.01;
      const amountDrift = Math.abs(stored_invoiced_amount - derived_invoiced_amount) > 0.01;
      const statusDrift = stored_billing_status !== derived_billing_status;
      
      const hasDrift = qtyDrift || amountDrift || statusDrift;

      const fact = {
        commitment_id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        
        // Derived financial
        derived_invoiced_qty,
        derived_invoiced_amount,
        derived_credit_applied,
        derived_paid_amount,
        derived_balance_due,
        derived_is_invoiced,
        derived_is_paid,
        derived_billing_status,
        
        // Supply facts
        required_qty,
        installed_qty,
        reserved_from_stock,
        available_to_allocate,
        installable_qty,
        remaining_to_bill_qty,
        
        // Stored values (for comparison)
        stored_invoiced_qty,
        stored_invoiced_amount,
        stored_billing_status,
        
        // Drift flags
        has_drift: hasDrift,
        qty_drift: qtyDrift,
        amount_drift: amountDrift,
        status_drift: statusDrift,
      };

      commitmentFacts.push(fact);

      if (hasDrift) {
        driftedCount++;
        driftReport.push({
          commitment_id: c.id,
          part_name: part?.part_name || 'Unknown',
          drifts: {
            invoiced_qty: qtyDrift ? { stored: stored_invoiced_qty, derived: derived_invoiced_qty } : null,
            invoiced_amount: amountDrift ? { stored: stored_invoiced_amount, derived: derived_invoiced_amount } : null,
            billing_status: statusDrift ? { stored: stored_billing_status, derived: derived_billing_status } : null,
          },
        });

        // Update if not dry_run
        if (!dry_run && (hasDrift || force_update)) {
          await base44.asServiceRole.entities.PartCommitment.update(c.id, {
            invoiced_qty: derived_invoiced_qty,
            invoiced_amount: derived_invoiced_amount,
            billing_status: derived_billing_status,
          });
          updatedCount++;
        }
      }
    }

    // Sample before/after (first 5 with drift)
    const sampleBeforeAfter = driftReport.slice(0, 5).map(d => {
      const fact = commitmentFacts.find(f => f.commitment_id === d.commitment_id);
      return {
        commitment_id: d.commitment_id,
        part_name: d.part_name,
        before: {
          invoiced_qty: fact?.stored_invoiced_qty,
          invoiced_amount: fact?.stored_invoiced_amount,
          billing_status: fact?.stored_billing_status,
        },
        after: {
          invoiced_qty: fact?.derived_invoiced_qty,
          invoiced_amount: fact?.derived_invoiced_amount,
          billing_status: fact?.derived_billing_status,
        },
      };
    });

    return Response.json({
      success: true,
      dry_run,
      project_id,
      counts: {
        total: commitments.length,
        drifted: driftedCount,
        updated: updatedCount,
      },
      commitment_facts: commitmentFacts,
      drift_report: driftReport,
      sample_before_after: sampleBeforeAfter,
      summary: {
        total_derived_invoiced: commitmentFacts.reduce((s, f) => s + f.derived_invoiced_amount, 0),
        total_derived_paid: commitmentFacts.reduce((s, f) => s + f.derived_paid_amount, 0),
        total_remaining_to_bill: commitmentFacts.reduce((s, f) => s + f.remaining_to_bill_qty, 0),
        total_installable: commitmentFacts.reduce((s, f) => s + f.installable_qty, 0),
      },
    });

  } catch (error) {
    console.error('normalizeProjectCommitmentBilling error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});