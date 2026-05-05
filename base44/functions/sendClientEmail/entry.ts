import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendClientEmail — Centralized client email transport
 * 
 * Two modes:
 * 1. rawHtml mode (preferred): Caller provides complete HTML body via `rawHtml`.
 *    sendClientEmail only wraps it in a minimal outer container and handles transport.
 * 2. Legacy mode: Caller provides section fields (projectName, contentBlockHtml, etc.)
 *    and sendClientEmail assembles them using buildLegacyHtml. This path exists for
 *    email types not yet upgraded (bulk_review, status_update, journal_entry, welcome, access).
 * 
 * Transport responsibilities (both modes):
 * - Sender identity (from line)
 * - Reply-to (hard-locked)
 * - Resend API dispatch
 * - Structured logging
 */

// ── BRAND CONSTANTS ──────────────────────────────────────────────────
const BRAND = {
  fromLine: 'Achtung Kraft Projects <updates@projects.achtungkraft.com>',
  replyTo: 'sales@achtungkraft.com',
  name: 'Achtung Kraft',
  color: '#cc0000',
  closing: '— Achtung Kraft Projects',
  portalBaseUrl: 'https://akclient.base44.app',
};

// ── Legacy HTML builder (for email types not yet upgraded) ────────────
function buildLegacyHtml({
  projectName, headline, greeting, introText,
  contentBlockHtml, commentBlockHtml, itemsListHtml,
  statusChangeHtml, linksBlockHtml,
  ctaUrl, ctaText, clientSlug,
}) {
  const sections = [];

  if (projectName) {
    sections.push(`<h1 style="margin:0 0 8px 0;color:${BRAND.color};font-size:24px;font-family:Arial,sans-serif;">PROJECT: ${projectName}</h1>`);
  }
  if (headline) {
    sections.push(`<h2 style="margin:0 0 20px 0;color:#333;font-size:18px;font-weight:normal;font-family:Arial,sans-serif;">${headline}</h2>`);
  }
  if (greeting) {
    sections.push(`<p style="margin:0 0 12px 0;color:#333;font-family:Arial,sans-serif;">${greeting}</p>`);
  }
  if (introText) {
    sections.push(`<p style="margin:0 0 16px 0;color:#333;font-family:Arial,sans-serif;">${introText}</p>`);
  }
  if (statusChangeHtml) {
    sections.push(statusChangeHtml);
  }
  if (contentBlockHtml) {
    sections.push(`<div style="background-color:#f9f9f9;border-left:4px solid ${BRAND.color};padding:16px;margin:20px 0;">${contentBlockHtml}</div>`);
  }
  if (itemsListHtml) {
    sections.push(`<ul style="list-style:none;padding:0;margin:20px 0;">${itemsListHtml}</ul>`);
  }
  if (commentBlockHtml) {
    sections.push(`
<div style="margin-top:16px;padding:14px;background:#1a1a1a;border-left:3px solid #dc2626;">
  <p style="margin:0 0 8px 0;font-weight:bold;color:#fff;font-family:Arial,sans-serif;">Latest Update From Ächtung Kraft:</p>
  <div style="margin:0;line-height:1.5;color:#e5e5e5;">${commentBlockHtml}</div>
</div>`);
  }
  if (linksBlockHtml) {
    sections.push(linksBlockHtml);
  }
  if (ctaUrl && ctaText) {
    sections.push(`
<p style="margin:30px 0;">
  <a href="${ctaUrl}" style="display:inline-block;background-color:${BRAND.color};color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;font-family:Arial,sans-serif;">${ctaText}</a>
</p>
<p style="color:#888;font-size:13px;font-family:Arial,sans-serif;">
  Direct link: <a href="${ctaUrl}" style="color:#888;text-decoration:underline;">${ctaUrl}</a>
</p>`);
  }
  if (clientSlug) {
    sections.push(`<p style="color:#888;font-size:13px;font-family:Arial,sans-serif;">Your portal code: <strong>${clientSlug}</strong></p>`);
  }
  sections.push(`<p style="color:#666;font-family:Arial,sans-serif;margin-top:32px;">${BRAND.closing}<br><span style="font-size:13px;color:#999;">Precision builds. Clear communication.</span></p>`);

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">${sections.join('\n')}</div>`;
}

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
    const payload = await req.json();

    const {
      to, subject, emailType, textBody,
      requestId, projectId, journalEntryId,
      // New: caller provides complete HTML
      rawHtml,
      // Legacy fields (used only if rawHtml is absent)
      contactName, projectName, headline, greeting, introText,
      contentBlockHtml, commentBlockHtml, itemsListHtml,
      statusChangeHtml, linksBlockHtml,
      ctaUrl, ctaText, clientSlug,
    } = payload;

    if (!to || !subject) {
      return Response.json({ error: 'Missing required fields: to, subject' }, { status: 400 });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not set");
      return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
    }

    // Determine HTML: use rawHtml if provided, otherwise fall back to legacy builder
    let html;
    if (rawHtml) {
      html = rawHtml;
    } else {
      html = buildLegacyHtml({
        projectName,
        headline,
        greeting: greeting || (contactName ? `Hi ${contactName},` : null),
        introText,
        contentBlockHtml,
        commentBlockHtml,
        itemsListHtml,
        statusChangeHtml,
        linksBlockHtml,
        ctaUrl,
        ctaText: ctaText || 'VIEW REQUEST',
        clientSlug,
      });
    }

    // Build Resend payload — reply_to is LAST to prevent overwrites
    const emailPayload = {
      from: BRAND.fromLine,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(textBody ? { text: textBody } : {}),
      reply_to: [BRAND.replyTo],
    };

    console.log("sendClientEmail payload", JSON.stringify({ to: emailPayload.to, subject: emailPayload.subject, reply_to: emailPayload.reply_to, mode: rawHtml ? 'rawHtml' : 'legacy' }));

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error(`sendClientEmail FAILED to=${to} type=${emailType}:`, errorData);
      return Response.json({ success: false, error: errorData }, { status: 500 });
    }

    const emailData = await emailResponse.json();

    console.log(JSON.stringify({
      event: 'CLIENT_EMAIL_SENT',
      emailId: emailData.id,
      to,
      emailType: emailType || 'unknown',
      requestId: requestId || null,
      projectId: projectId || null,
      journalEntryId: journalEntryId || null,
      timestamp: new Date().toISOString(),
    }));

    return Response.json({
      success: true,
      emailId: emailData.id,
    });

  } catch (error) {
    console.error("sendClientEmail error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});