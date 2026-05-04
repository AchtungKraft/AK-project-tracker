import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendClientEmail — Centralized client email sender
 * 
 * Single entry point for ALL client-facing emails. Controls:
 * - Sender identity (Model A: Brand Sender)
 * - Reply-to handling
 * - HTML wrapper template with consistent branding
 * - Portal link generation
 * - Send logging
 * 
 * Payload:
 * {
 *   to: string (email address),
 *   contactName: string,
 *   subject: string,
 *   emailType: string (needs_review|bulk_review|status_update|journal_entry|welcome|access),
 *   
 *   // Content sections (all optional, rendered in order)
 *   projectName: string,
 *   headline: string,           // secondary heading below project name
 *   greeting: string,           // "Hi {name}," — auto-generated from contactName if omitted
 *   introText: string,          // opening paragraph
 *   contentBlockHtml: string,   // main content (callout box)
 *   commentBlockHtml: string,   // latest team comment section
 *   itemsListHtml: string,      // for bulk emails
 *   statusChangeHtml: string,   // for status update emails
 *   linksBlockHtml: string,     // related links section
 *   
 *   // CTA
 *   ctaUrl: string,             // button URL
 *   ctaText: string,            // button text (default: "VIEW REQUEST")
 *   directLinkNote: string,     // text below button (default: shows URL)
 *   
 *   // Portal code
 *   clientSlug: string,         // shown as "Your portal code" if present
 *   
 *   // Text fallback
 *   textBody: string,           // plain text version
 *   
 *   // Reply-to is HARD-LOCKED to sales@achtungkraft.com at the transport layer.
 *   // No caller can override it.
 *   
 *   // Logging context
 *   requestId: string,
 *   projectId: string,
 *   journalEntryId: string,
 * }
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

// ── HTML email wrapper ───────────────────────────────────────────────
function buildEmailHtml({
  projectName, headline, greeting, introText,
  contentBlockHtml, commentBlockHtml, itemsListHtml,
  statusChangeHtml, linksBlockHtml,
  ctaUrl, ctaText, clientSlug,
}) {
  const sections = [];

  // Header
  if (projectName) {
    sections.push(`<h1 style="margin:0 0 8px 0;color:${BRAND.color};font-size:24px;font-family:Arial,sans-serif;">PROJECT: ${projectName}</h1>`);
  }
  if (headline) {
    sections.push(`<h2 style="margin:0 0 20px 0;color:#333;font-size:18px;font-weight:normal;font-family:Arial,sans-serif;">${headline}</h2>`);
  }

  // Greeting
  if (greeting) {
    sections.push(`<p style="margin:0 0 12px 0;color:#333;font-family:Arial,sans-serif;">${greeting}</p>`);
  }

  // Intro
  if (introText) {
    sections.push(`<p style="margin:0 0 16px 0;color:#333;font-family:Arial,sans-serif;">${introText}</p>`);
  }

  // Status change
  if (statusChangeHtml) {
    sections.push(statusChangeHtml);
  }

  // Content callout
  if (contentBlockHtml) {
    sections.push(`<div style="background-color:#f9f9f9;border-left:4px solid ${BRAND.color};padding:16px;margin:20px 0;">${contentBlockHtml}</div>`);
  }

  // Items list (bulk)
  if (itemsListHtml) {
    sections.push(`<ul style="list-style:none;padding:0;margin:20px 0;">${itemsListHtml}</ul>`);
  }

  // Latest team comment
  if (commentBlockHtml) {
    sections.push(`
<div style="margin-top:16px;padding:14px;background:#1a1a1a;border-left:3px solid #dc2626;">
  <p style="margin:0 0 8px 0;font-weight:bold;color:#fff;font-family:Arial,sans-serif;">Latest Update From Ächtung Kraft:</p>
  <div style="margin:0;line-height:1.5;color:#e5e5e5;">${commentBlockHtml}</div>
</div>`);
  }

  // Related links
  if (linksBlockHtml) {
    sections.push(linksBlockHtml);
  }

  // CTA button
  if (ctaUrl && ctaText) {
    sections.push(`
<p style="margin:30px 0;">
  <a href="${ctaUrl}" style="display:inline-block;background-color:${BRAND.color};color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;font-family:Arial,sans-serif;">${ctaText}</a>
</p>
<p style="color:#666;font-size:14px;font-family:Arial,sans-serif;">
  Direct link: <a href="${ctaUrl}" style="color:#3b82f6;">${ctaUrl}</a>
</p>`);
  }

  // Portal code
  if (clientSlug) {
    sections.push(`<p style="color:#666;font-size:14px;font-family:Arial,sans-serif;">Your portal code: <strong>${clientSlug}</strong></p>`);
  }

  // Respond-in-portal note
  sections.push(`<p style="color:#999;font-size:13px;font-style:italic;margin-top:24px;font-family:Arial,sans-serif;">For detailed feedback, please use the portal. You can also reply directly to this email.</p>`);

  // Closing
  sections.push(`<p style="color:#666;font-family:Arial,sans-serif;">${BRAND.closing}</p>`);

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
      to, contactName, subject, emailType,
      projectName, headline, greeting, introText,
      contentBlockHtml, commentBlockHtml, itemsListHtml,
      statusChangeHtml, linksBlockHtml,
      ctaUrl, ctaText, clientSlug,
      textBody,
      requestId, projectId, journalEntryId,
    } = payload;

    // Validation
    if (!to || !subject) {
      return Response.json({ error: 'Missing required fields: to, subject' }, { status: 400 });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not set");
      return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
    }

    // Build HTML
    const html = buildEmailHtml({
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

    // Build final Resend payload — reply_to is LAST to prevent any future ...rest overwrites
    const emailPayload = {
      from: BRAND.fromLine,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(textBody ? { text: textBody } : {}),
      // 🔴 MUST BE LAST — hard-locked, no overrides. Resend expects an array.
      reply_to: [BRAND.replyTo],
    };

    // Structured send log
    console.log("sendClientEmail payload", JSON.stringify({ to: emailPayload.to, subject: emailPayload.subject, reply_to: emailPayload.reply_to }));

    // Send
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

    // Structured log
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