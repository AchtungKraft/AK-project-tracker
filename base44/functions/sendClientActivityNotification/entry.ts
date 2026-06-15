import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * sendClientActivityNotification — Centralized internal email alerts
 * for client-originated feedback activity.
 *
 * Architecture:
 *   clientEvent → notificationService → emailTransport (sendClientEmail)
 *
 * Future transports (Slack, SMS, push) can be added alongside email
 * without changing calling code — the event payload is transport-agnostic.
 *
 * DUPLICATE PROTECTION:
 *   This function is only called from backend functions (publicClientDecision,
 *   publicAddClientComment) which execute exactly once per genuine client action.
 *   Frontend rerenders, subscription updates, and query refreshes never invoke
 *   these backend endpoints.
 */

// ── CONFIGURATION ────────────────────────────────────────────────────

const NOTIFICATION_RECIPIENTS = [
  'Sales@achtungkraft.com',
];

const APP_BASE_URL = 'https://achtungkraft.base44.app';

// Action type → email subject template
const SUBJECT_TEMPLATES = {
  APPROVED:           'CLIENT APPROVED — {project_name}',
  COMMENT:            'CLIENT COMMENTED — {project_name}',
  UPLOAD:             'CLIENT UPLOADED FILES — {project_name}',
  REVISION_REQUESTED: 'CLIENT REQUESTED CHANGES — {project_name}',
};

// ── HELPERS ──────────────────────────────────────────────────────────

function formatTimestamp(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getCommentText(comment) {
  if (!comment) return null;
  if (typeof comment === 'string') return comment;
  if (comment.content_html) return stripHtml(comment.content_html);
  return comment.content_fallback || comment.body || comment.note || null;
}

function buildSubject(actionType, projectName) {
  const template = SUBJECT_TEMPLATES[actionType] || `CLIENT ACTIVITY — {project_name}`;
  return template.replace('{project_name}', projectName || 'Unknown Project');
}

function buildDirectLink(requestId) {
  return `${APP_BASE_URL}/clientfeedbackdetail?id=${requestId}`;
}

function buildActionLabel(actionType) {
  const labels = {
    APPROVED: 'APPROVED',
    COMMENT: 'COMMENT ADDED',
    UPLOAD: 'FILES UPLOADED',
    REVISION_REQUESTED: 'CHANGES REQUESTED',
  };
  return labels[actionType] || actionType;
}

function buildActionColor(actionType) {
  const colors = {
    APPROVED: '#16a34a',
    COMMENT: '#2563eb',
    UPLOAD: '#7c3aed',
    REVISION_REQUESTED: '#ea580c',
  };
  return colors[actionType] || '#6b7280';
}

// ── EMAIL BUILDER ────────────────────────────────────────────────────

function buildNotificationHtml({
  projectName, clientName, requestTitle, actionType,
  timestamp, commentText, files, previousStatus, newStatus, directLink,
}) {
  const actionLabel = buildActionLabel(actionType);
  const actionColor = buildActionColor(actionType);

  const sections = [];

  // Action banner
  sections.push(`
    <div style="background:${actionColor};color:#fff;padding:14px 20px;border-radius:6px 6px 0 0;font-size:18px;font-weight:700;letter-spacing:0.5px;">
      ${actionLabel}
    </div>
  `);

  // Metadata table
  const rows = [
    ['Project', projectName || '—'],
    ['Client', clientName || '—'],
    ['Feedback Request', requestTitle || '—'],
    ['Action', actionLabel],
    ['Time', timestamp || formatTimestamp()],
  ];

  if (previousStatus && newStatus) {
    rows.push(['Previous Status', previousStatus]);
    rows.push(['New Status', newStatus]);
  }

  const tableRows = rows.map(([label, value]) =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px;color:#888;font-weight:600;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:8px 12px;font-size:14px;color:#222;">${value}</td>
    </tr>`
  ).join('');

  sections.push(`
    <table style="width:100%;border-collapse:collapse;margin-top:0;">
      ${tableRows}
    </table>
  `);

  // Comment content
  if (commentText) {
    sections.push(`
      <div style="margin:16px 20px;padding:14px;background:#f8f8f8;border-left:4px solid ${actionColor};border-radius:4px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:6px;">Comment</div>
        <div style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;">${commentText}</div>
      </div>
    `);
  }

  // File uploads
  if (files && files.length > 0) {
    const fileList = files.map(f => {
      const name = typeof f === 'string' ? f : (f.name || f.label || f.file_url || 'unnamed file');
      return `<li style="margin:4px 0;font-size:13px;color:#444;">${name}</li>`;
    }).join('');
    sections.push(`
      <div style="margin:16px 20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:6px;">Files Uploaded (${files.length})</div>
        <ul style="margin:0;padding-left:20px;">${fileList}</ul>
      </div>
    `);
  }

  // Direct link button
  sections.push(`
    <div style="margin:24px 20px 12px;">
      <a href="${directLink}" style="display:inline-block;background:#cc0000;color:#fff;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">
        Open Feedback Request →
      </a>
    </div>
    <div style="margin:0 20px 20px;font-size:12px;color:#999;">
      Direct link: <a href="${directLink}" style="color:#999;text-decoration:underline;word-break:break-all;">${directLink}</a>
    </div>
  `);

  // Footer
  sections.push(`
    <div style="margin:0 20px 20px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#bbb;">
      Internal notification — Achtung Kraft Feedback Activity Monitor
    </div>
  `);

  return `<div style="max-width:580px;margin:0 auto;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
    ${sections.join('')}
  </div>`;
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const {
      projectId,
      requestId,
      clientName,
      actionType,      // APPROVED | COMMENT | UPLOAD | REVISION_REQUESTED
      comment,          // string or object with content_html/body/note
      files,            // array of file objects or strings
      previousStatus,   // for approvals/revisions
      newStatus,        // for approvals/revisions
    } = await req.json();

    if (!requestId || !actionType) {
      return Response.json({ error: 'Missing requestId or actionType' }, { status: 400 });
    }

    // Fetch project and request in parallel — resilient to missing IDs
    let project = null;
    let request = null;
    try {
      const [projects, requests] = await Promise.all([
        projectId
          ? base44.asServiceRole.entities.Project.filter({ id: projectId }).catch(() => [])
          : Promise.resolve([]),
        base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId }).catch(() => []),
      ]);
      project = projects[0] || null;
      request = requests[0] || null;

      // If we have a request but no project, try fetching the project
      if (!project && request?.project_id) {
        const p2 = await base44.asServiceRole.entities.Project.filter({ id: request.project_id }).catch(() => []);
        project = p2[0] || null;
      }
    } catch (lookupErr) {
      console.error('[NOTIFICATION] Lookup failed:', lookupErr.message);
    }

    const projectName = project?.name || 'Unknown Project';
    const requestTitle = request?.title || 'Unknown Request';
    const resolvedProjectId = projectId || request?.project_id || null;

    // Build notification payload (transport-agnostic)
    const timestamp = formatTimestamp();
    const directLink = buildDirectLink(requestId);
    const commentText = getCommentText(comment);

    const subject = buildSubject(actionType, projectName);

    const html = buildNotificationHtml({
      projectName,
      clientName: clientName || 'Unknown Client',
      requestTitle,
      actionType,
      timestamp,
      commentText,
      files,
      previousStatus,
      newStatus,
      directLink,
    });

    // ── EMAIL TRANSPORT — direct Resend API call ───────────────
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[NOTIFICATION] RESEND_API_KEY not set');
      return Response.json({ success: false, error: 'RESEND_API_KEY not set' }, { status: 500 });
    }

    const emailResults = [];
    for (const recipient of NOTIFICATION_RECIPIENTS) {
      try {
        const emailPayload = {
          from: 'Achtung Kraft Projects <updates@projects.achtungkraft.com>',
          to: [recipient],
          subject,
          html,
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

        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          emailResults.push({ to: recipient, success: true, emailId: emailData.id });
        } else {
          const errData = await emailResponse.json().catch(() => ({}));
          console.error(`[NOTIFICATION] Resend failed for ${recipient}:`, JSON.stringify(errData));
          emailResults.push({ to: recipient, success: false, error: errData });
        }
      } catch (emailErr) {
        console.error(`Failed to send notification to ${recipient}:`, emailErr.message);
        emailResults.push({ to: recipient, success: false, error: emailErr.message });
      }
    }

    console.log(JSON.stringify({
      event: 'CLIENT_ACTIVITY_NOTIFICATION',
      actionType,
      requestId,
      projectId: resolvedProjectId,
      clientName,
      recipients: emailResults.length,
      successful: emailResults.filter(r => r.success).length,
      timestamp,
    }));

    return Response.json({
      success: true,
      notifications: emailResults,
    });

  } catch (error) {
    console.error('sendClientActivityNotification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});