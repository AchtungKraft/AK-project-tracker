import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * updateInvoiceDraft — admin only. Updates a draft invoice's notes.
 *
 * Line replacement is RETIRED: it skipped eligibility, draft-allocation and labor/service checks and
 * wrote credit_applied on a draft. Use removeDraftInvoiceLines (Edit Draft), deleteDraftInvoice, or
 * createProjectInvoiceDraft instead.
 *
 * Inputs: invoice_id (required), notes (optional)
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
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { invoice_id, notes, lines } = await req.json();
    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    if (lines !== undefined) {
      return Response.json({ success: false, code: 'LINE_REPLACEMENT_RETIRED', error: 'Replacing draft lines is no longer supported. Remove lines with Edit Draft, or delete the draft and create a new one.' }, { status: 410 });
    }

    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoices[0].status !== 'draft') {
      return Response.json({ error: `Cannot update: invoice is ${invoices[0].status}, must be draft` }, { status: 400 });
    }

    if (notes !== undefined) await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, { notes });
    const [updatedInvoice] = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    return Response.json({ success: true, invoice: updatedInvoice, warnings: [] });
  } catch (error) {
    console.error('updateInvoiceDraft error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});