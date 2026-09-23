/**
 * sendTransactionalEmail — Secure server-to-server transactional email endpoint
 *
 * Architecture:
 *   AK COMMS → Bearer AK_COMMS_API_KEY → this function → sendClientEmail → Resend API → customer
 *
 * Security:
 *   - API key auth (not user-session auth — this is a webhook-style endpoint)
 *   - Source locked to AK_COMMS
 *   - Template whitelist — only approved templates
 *   - From/Reply-To controlled by Projects, not caller
 *   - No arbitrary HTML accepted
 *
 * Idempotency:
 *   - request_id is looked up in TransactionalEmailLog before sending
 *   - Duplicate request_id returns the original result without re-sending
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ── APPROVED TEMPLATES ───────────────────────────────────────────────
const TEMPLATES = {
  MESSAGING_OPT_IN_REQUEST: {
    subject: 'Text messaging with Ächtung Kraft',
    requiredVariables: ['customer_name', 'consent_url'],
    buildHtml: (vars) => {
      const firstName = vars.customer_name?.trim().split(/\s+/)[0] || 'there';
      return `<div style="max-width:580px;margin:0 auto;padding:36px 24px;background:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">

  <!-- Greeting -->
  <div style="font-size:15px;color:#333;line-height:1.5;">Hi ${firstName},</div>

  <!-- Title -->
  <div style="font-size:28px;line-height:1.2;font-weight:700;color:#111;margin-top:24px;">Text Messaging<br/>with Ächtung Kraft</div>

  <!-- Body -->
  <div style="margin-top:20px;font-size:15px;color:#555;line-height:1.6;">
    You asked to communicate with Ächtung Kraft about your inquiry or project.
  </div>
  <div style="margin-top:12px;font-size:15px;color:#555;line-height:1.6;">
    Confirm your text messaging preferences using the link below.
  </div>

  <!-- CTA -->
  <div style="margin-top:28px;">
    <a href="${vars.consent_url}" style="display:inline-block;background:#cc0000;color:#fff;padding:14px 24px;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;letter-spacing:0.02em;">CONFIRM TEXT MESSAGING</a>
  </div>

  <!-- Direct link -->
  <div style="margin-top:16px;font-size:13px;color:#666;">
    Direct link: <a href="${vars.consent_url}" style="color:#666;text-decoration:underline;word-break:break-all;">${vars.consent_url}</a>
  </div>

  <!-- Opt-out note -->
  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e5e5;">
    <div style="font-size:14px;color:#555;line-height:1.6;">
      You can continue communicating with us by email without opting in to text messaging.
    </div>
  </div>

  <!-- Sign-off -->
  <div style="margin-top:32px;font-size:13px;color:#666;">&mdash; Achtung Kraft<br/>Precision builds. Clear communication.</div>

</div>`;
    },
    buildText: (vars) => {
      const firstName = vars.customer_name?.trim().split(/\s+/)[0] || 'there';
      return [
        `Hi ${firstName},`,
        '',
        'Text Messaging with Ächtung Kraft',
        '',
        'You asked to communicate with Ächtung Kraft about your inquiry or project.',
        '',
        'Confirm your text messaging preferences using the link below.',
        '',
        `CONFIRM TEXT MESSAGING: ${vars.consent_url}`,
        '',
        '---',
        '',
        'You can continue communicating with us by email without opting in to text messaging.',
        '',
        '— Achtung Kraft',
        'Precision builds. Clear communication.',
      ].join('\n');
    },
  },
};

// ── VALIDATION HELPERS ───────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRequest(body) {
  const errors = [];

  if (!body.request_id || typeof body.request_id !== 'string' || body.request_id.trim().length === 0) {
    errors.push('request_id is required');
  }
  if (body.source !== 'AK_COMMS') {
    errors.push('source must be AK_COMMS');
  }
  if (!body.template || !TEMPLATES[body.template]) {
    errors.push(`template must be one of: ${Object.keys(TEMPLATES).join(', ')}`);
  }
  if (!body.to?.email || !EMAIL_REGEX.test(body.to.email)) {
    errors.push('to.email must be a valid email address');
  }

  // Template-specific variable validation
  if (body.template && TEMPLATES[body.template]) {
    const tpl = TEMPLATES[body.template];
    for (const key of tpl.requiredVariables) {
      if (!body.variables?.[key] || typeof body.variables[key] !== 'string' || body.variables[key].trim().length === 0) {
        errors.push(`variables.${key} is required`);
      }
    }
    // Validate consent_url is HTTPS
    if (body.variables?.consent_url && !body.variables.consent_url.startsWith('https://')) {
      errors.push('variables.consent_url must be an HTTPS URL');
    }
  }

  return errors;
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return Response.json({ accepted: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // ── AUTH: Bearer token validation ──
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const expectedKey = Deno.env.get('AK_COMMS_API_KEY');

    if (!expectedKey) {
      console.error('[TRANSACTIONAL] AK_COMMS_API_KEY secret not configured');
      return Response.json({ accepted: false, error: 'Service misconfigured', retryable: false }, { status: 500 });
    }

    if (!token || token !== expectedKey) {
      return Response.json({ accepted: false, error: 'Invalid or missing API credential', retryable: false }, { status: 401 });
    }

    // ── Parse and validate request ──
    const body = await req.json();
    const validationErrors = validateRequest(body);
    if (validationErrors.length > 0) {
      return Response.json({
        accepted: false,
        request_id: body.request_id || null,
        error: validationErrors.join('; '),
        retryable: false,
      }, { status: 400 });
    }

    // ── SDK client for entity access (service role via request auth) ──
    // Since this is API-key auth (not user session), we need the SDK for entity ops.
    // We create the client from the request but use asServiceRole for entity access.
    const base44 = createClientFromRequest(req);

    // ── IDEMPOTENCY CHECK ──
    const requestId = body.request_id.trim();
    const existing = await base44.asServiceRole.entities.TransactionalEmailLog.filter({
      request_id: requestId,
    });

    if (existing.length > 0) {
      const prev = existing[0];
      console.log(`[TRANSACTIONAL] Idempotent hit: request_id=${requestId} status=${prev.status}`);
      if (prev.status === 'sent') {
        return Response.json({
          accepted: true,
          request_id: requestId,
          message_id: prev.provider_message_id,
          recipient: prev.recipient_email,
          status: 'sent',
          idempotent_replay: true,
        });
      }
      // Previous attempt failed — allow retry by falling through
      // Delete the failed record so we can create a fresh one
      await base44.asServiceRole.entities.TransactionalEmailLog.delete(prev.id);
    }

    // ── BUILD EMAIL ──
    const tpl = TEMPLATES[body.template];
    const recipientEmail = body.to.email.trim().toLowerCase();
    const html = tpl.buildHtml(body.variables);
    const text = tpl.buildText(body.variables);

    // ── SEND VIA RESEND (same provider as sendClientEmail) ──
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[TRANSACTIONAL] RESEND_API_KEY not set');
      return Response.json({
        accepted: false, request_id: requestId,
        error: 'Email provider not configured', retryable: true,
      }, { status: 500 });
    }

    const emailPayload = {
      from: 'Achtung Kraft <updates@projects.achtungkraft.com>',
      to: [recipientEmail],
      subject: tpl.subject,
      html,
      text,
      reply_to: ['sales@achtungkraft.com'],
    };

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errData = await emailResponse.json().catch(() => ({}));
      console.error(`[TRANSACTIONAL] Resend failed for request_id=${requestId}:`, JSON.stringify(errData));

      // Log the failure
      await base44.asServiceRole.entities.TransactionalEmailLog.create({
        request_id: requestId,
        source: body.source,
        template: body.template,
        recipient_email: recipientEmail,
        recipient_name: body.to.name || '',
        status: 'failed',
        error: JSON.stringify(errData).substring(0, 500),
        retryable: emailResponse.status >= 500,
        variables_snapshot: body.variables,
      });

      const retryable = emailResponse.status >= 500;
      return Response.json({
        accepted: false,
        request_id: requestId,
        error: 'Email provider delivery failure',
        retryable,
      }, { status: 502 });
    }

    const emailData = await emailResponse.json();

    // ── LOG SUCCESS ──
    await base44.asServiceRole.entities.TransactionalEmailLog.create({
      request_id: requestId,
      source: body.source,
      template: body.template,
      recipient_email: recipientEmail,
      recipient_name: body.to.name || '',
      status: 'sent',
      provider_message_id: emailData.id || null,
      variables_snapshot: body.variables,
    });

    console.log(JSON.stringify({
      event: 'TRANSACTIONAL_EMAIL_SENT',
      request_id: requestId,
      source: body.source,
      template: body.template,
      recipient: recipientEmail,
      message_id: emailData.id,
      timestamp: new Date().toISOString(),
    }));

    return Response.json({
      accepted: true,
      request_id: requestId,
      message_id: emailData.id,
      recipient: recipientEmail,
      status: 'sent',
    });

  } catch (error) {
    console.error('[TRANSACTIONAL] Unhandled error:', error.message);
    return Response.json({
      accepted: false,
      request_id: null,
      error: 'Internal server error',
      retryable: true,
    }, { status: 500 });
  }
});