import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validateInvoiceIntegrity - Phase 9D-A Admin Tool
 * 
 * Validates all InvoiceBatch records for:
 * 1. Total amount matches sum of line items
 * 2. All lines have valid commitment_id
 * 3. No duplicate commitment_id across non-draft batches
 * 4. No orphan lines (lines without valid batch)
 * 5. Invoice number format compliance (no INV-MANUAL- prefix allowed)
 * 
 * Returns detailed integrity report with violations.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin only
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { project_id } = await req.json().catch(() => ({}));

    // Fetch all data
    const [batches, lines, commitments] = await Promise.all([
      base44.asServiceRole.entities.InvoiceBatch.list(),
      base44.asServiceRole.entities.InvoiceBatchLine.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
    ]);

    const commitmentMap = new Map(commitments.map(c => [c.id, c]));
    const batchMap = new Map(batches.map(b => [b.id, b]));
    
    // Group lines by batch
    const linesByBatch = new Map();
    for (const line of lines) {
      if (!linesByBatch.has(line.batch_id)) {
        linesByBatch.set(line.batch_id, []);
      }
      linesByBatch.get(line.batch_id).push(line);
    }

    const violations = [];
    const warnings = [];
    let validCount = 0;

    // ================================================================
    // 1. VALIDATE EACH BATCH
    // ================================================================
    for (const batch of batches) {
      const batchViolations = [];
      const batchLines = linesByBatch.get(batch.id) || [];

      // Check 1: Invoice number format (no manual prefix)
      const invoiceNum = batch.invoice_number || batch.batch_name || '';
      if (invoiceNum.startsWith('INV-MANUAL-')) {
        batchViolations.push({
          code: 'LEGACY_MANUAL_PREFIX',
          message: `Legacy manual invoice prefix detected: ${invoiceNum}`,
          severity: batch.status === 'draft' ? 'WARNING' : 'ERROR'
        });
      }

      // Check 2: Total amount matches sum of lines
      const calculatedTotal = batchLines.reduce((sum, l) => sum + (l.line_total || 0), 0);
      const storedTotal = batch.total_amount || 0;
      
      if (Math.abs(calculatedTotal - storedTotal) > 0.01) {
        batchViolations.push({
          code: 'TOTAL_MISMATCH',
          message: `Stored total (${storedTotal.toFixed(2)}) != calculated (${calculatedTotal.toFixed(2)})`,
          severity: 'ERROR',
          stored: storedTotal,
          calculated: calculatedTotal,
          delta: storedTotal - calculatedTotal
        });
      }

      // Check 3: Line count matches
      const storedLineCount = batch.line_count || 0;
      if (storedLineCount !== batchLines.length) {
        batchViolations.push({
          code: 'LINE_COUNT_MISMATCH',
          message: `Stored line_count (${storedLineCount}) != actual (${batchLines.length})`,
          severity: 'WARNING'
        });
      }

      // Check 4: All lines have commitment_id (for non-empty batches)
      const linesWithoutCommitment = batchLines.filter(l => !l.commitment_id);
      if (linesWithoutCommitment.length > 0 && batch.status !== 'voided') {
        batchViolations.push({
          code: 'MISSING_COMMITMENT_ID',
          message: `${linesWithoutCommitment.length} line(s) missing commitment_id`,
          severity: 'ERROR',
          line_ids: linesWithoutCommitment.map(l => l.id)
        });
      }

      // Check 5: Lines reference valid commitments
      for (const line of batchLines) {
        if (line.commitment_id && !commitmentMap.has(line.commitment_id)) {
          batchViolations.push({
            code: 'ORPHAN_COMMITMENT_REFERENCE',
            message: `Line ${line.id} references non-existent commitment ${line.commitment_id}`,
            severity: 'ERROR',
            line_id: line.id
          });
        }
      }

      if (batchViolations.length > 0) {
        violations.push({
          batch_id: batch.id,
          invoice_number: batch.invoice_number || batch.batch_name,
          status: batch.status,
          total_amount: batch.total_amount,
          line_count: batchLines.length,
          errors: batchViolations
        });
      } else {
        validCount++;
      }
    }

    // ================================================================
    // 2. CHECK FOR DUPLICATE COMMITMENTS ACROSS BATCHES
    // ================================================================
    const commitmentToBatch = new Map();
    const duplicates = [];

    for (const line of lines) {
      if (!line.commitment_id) continue;
      
      const batch = batchMap.get(line.batch_id);
      // Only check non-draft, non-voided batches
      if (!batch || batch.status === 'draft' || batch.status === 'voided') continue;

      if (commitmentToBatch.has(line.commitment_id)) {
        const existing = commitmentToBatch.get(line.commitment_id);
        duplicates.push({
          commitment_id: line.commitment_id,
          batch_1: { id: existing.batch_id, invoice: existing.invoice_number },
          batch_2: { id: line.batch_id, invoice: batch.invoice_number || batch.batch_name },
          severity: 'CRITICAL'
        });
      } else {
        commitmentToBatch.set(line.commitment_id, {
          batch_id: line.batch_id,
          invoice_number: batch?.invoice_number || batch?.batch_name
        });
      }
    }

    // ================================================================
    // 3. CHECK FOR ORPHAN LINES (no valid batch)
    // ================================================================
    const orphanLines = lines.filter(l => !batchMap.has(l.batch_id));
    if (orphanLines.length > 0) {
      warnings.push({
        code: 'ORPHAN_LINES',
        message: `${orphanLines.length} line(s) reference non-existent batches`,
        line_ids: orphanLines.map(l => l.id)
      });
    }

    // ================================================================
    // SUMMARY
    // ================================================================
    const hasCritical = duplicates.length > 0 || violations.some(v => v.errors.some(e => e.severity === 'CRITICAL' || e.severity === 'ERROR'));

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_batches: batches.length,
        valid_batches: validCount,
        batches_with_issues: violations.length,
        duplicate_commitment_count: duplicates.length,
        orphan_line_count: orphanLines.length,
        integrity_status: hasCritical ? 'FAILED' : violations.length > 0 ? 'DEGRADED' : 'OK'
      },
      violations,
      duplicate_commitments: duplicates,
      warnings,
      rules_enforced: [
        'TOTAL_MATCHES_LINES: batch.total_amount must equal sum of line_total',
        'ALL_LINES_HAVE_COMMITMENT: Every line must have commitment_id',
        'NO_DUPLICATE_INVOICING: Commitment cannot be in multiple non-draft batches',
        'NO_LEGACY_PREFIX: INV-MANUAL-* prefix is deprecated',
        'NO_ORPHAN_LINES: All lines must reference valid batch'
      ]
    });

  } catch (error) {
    console.error('validateInvoiceIntegrity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});