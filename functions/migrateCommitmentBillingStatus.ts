import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 3: Legacy Billing Status Migration
 * 
 * Migrates all PartCommitment.billing_status values to canonical states:
 * - UNBILLED (was: null, '', 'billable', 'not_invoiced', 'NOT_INVOICED', 'invoice_client')
 * - INVOICED (was: 'awaiting_pay', 'AWAITING_PAY', 'awaiting_payment', 'sent')
 * - PAID (unchanged)
 * 
 * Returns migration report with counts.
 */

const CANONICAL_STATUS = {
  UNBILLED: 'unbilled',
  INVOICED: 'invoiced',
  PAID: 'paid',
};

// Map legacy values to canonical
function normalizeToCanonical(rawStatus) {
  if (!rawStatus) return CANONICAL_STATUS.UNBILLED;
  
  const status = rawStatus.toLowerCase().trim();
  
  // Already canonical
  if (['unbilled', 'invoiced', 'paid'].includes(status)) {
    return status;
  }
  
  // PAID states
  if (['client_paid'].includes(status)) {
    return CANONICAL_STATUS.PAID;
  }
  
  // INVOICED states
  if ([
    'awaiting_pay',
    'awaiting_payment',
    'sent',
    'client_invoiced'
  ].includes(status)) {
    return CANONICAL_STATUS.INVOICED;
  }
  
  // UNBILLED states (default)
  // billable, not_invoiced, invoice_client, etc.
  return CANONICAL_STATUS.UNBILLED;
}

Deno.serve(async (req) => {
  // CORS
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
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json().catch(() => ({}));

    // Fetch all commitments
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
    
    const report = {
      total_commitments: allCommitments.length,
      already_canonical: 0,
      migrated: {
        to_unbilled: [],
        to_invoiced: [],
        to_paid: [],
      },
      legacy_values_found: {},
      dry_run,
    };

    const updates = [];

    for (const commitment of allCommitments) {
      const currentStatus = commitment.billing_status;
      const canonicalStatus = normalizeToCanonical(currentStatus);
      
      // Track legacy values found
      const statusKey = currentStatus || '(null)';
      report.legacy_values_found[statusKey] = (report.legacy_values_found[statusKey] || 0) + 1;
      
      // Check if already canonical
      if (currentStatus === canonicalStatus) {
        report.already_canonical++;
        continue;
      }
      
      // Record migration
      const migrationEntry = {
        commitment_id: commitment.id,
        part_id: commitment.part_id,
        project_id: commitment.project_id,
        from: currentStatus,
        to: canonicalStatus,
      };
      
      if (canonicalStatus === CANONICAL_STATUS.UNBILLED) {
        report.migrated.to_unbilled.push(migrationEntry);
      } else if (canonicalStatus === CANONICAL_STATUS.INVOICED) {
        report.migrated.to_invoiced.push(migrationEntry);
      } else if (canonicalStatus === CANONICAL_STATUS.PAID) {
        report.migrated.to_paid.push(migrationEntry);
      }
      
      updates.push({
        id: commitment.id,
        billing_status: canonicalStatus,
      });
    }

    // Execute updates if not dry run
    if (!dry_run && updates.length > 0) {
      for (const update of updates) {
        await base44.asServiceRole.entities.PartCommitment.update(
          update.id, 
          { billing_status: update.billing_status }
        );
      }
    }

    const summary = {
      ...report,
      total_migrated: updates.length,
      migration_breakdown: {
        to_unbilled: report.migrated.to_unbilled.length,
        to_invoiced: report.migrated.to_invoiced.length,
        to_paid: report.migrated.to_paid.length,
      },
    };

    return Response.json({
      success: true,
      message: dry_run 
        ? `DRY RUN: Would migrate ${updates.length} commitments`
        : `Migrated ${updates.length} commitments to canonical billing status`,
      summary,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
});