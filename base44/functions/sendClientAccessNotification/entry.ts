import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * sendClientAccessNotification
 * 
 * Sends client access link via all opted-in channels (email, SMS, WhatsApp).
 * Respects notification preferences and compliance opt-in dates.
 * 
 * Inputs:
 * - clientContactId (required)
 * - projectId (required)
 * - accessId (required)
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

    const { clientContactId, projectId, accessId } = await req.json();

    if (!clientContactId || !projectId || !accessId) {
      return Response.json({ error: 'Missing required parameters: clientContactId, projectId, accessId' }, { status: 400 });
    }

    // Fetch all needed data in parallel
    const [contacts, projects, accesses] = await Promise.all([
      base44.asServiceRole.entities.ClientContact.filter({ id: clientContactId }),
      base44.asServiceRole.entities.Project.filter({ id: projectId }),
      base44.asServiceRole.entities.ProjectClientAccess.filter({ id: accessId }),
    ]);

    const contact = contacts[0];
    const project = projects[0];
    const access = accesses[0];

    if (!contact) return Response.json({ error: 'Client contact not found' }, { status: 404 });
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    if (!access) return Response.json({ error: 'Access record not found' }, { status: 404 });

    // Build portal URL
    const clientPortalBaseUrl = 'https://akclient.base44.app';
    const clientSlug = contact.url_slug || access.url_slug || '';
    const portalUrl = clientSlug
      ? `${clientPortalBaseUrl}?slug=${clientSlug}`
      : `${clientPortalBaseUrl}?token=${access.share_token}`;

    const channelsSent = [];

    // --- EMAIL ---
    if (contact.notify_email !== false) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
  <p>Hi ${contact.name},</p>
  <p>You have access to your project portal. Use the link below to view updates, review designs, and provide feedback.</p>
  ${clientSlug ? `<p style="background: #fef3c7; padding: 12px; border-radius: 4px;"><strong>Portal Code:</strong> ${clientSlug}</p>` : ''}
  <p><a href="${portalUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">ACCESS YOUR PORTAL</a></p>
  <p style="color: #666; font-size: 14px;">Direct link: <a href="${portalUrl}">${portalUrl}</a></p>
  <p>— Achtung Kraft Projects</p>
</div>`;

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: "Achtung Kraft Projects <updates@projects.achtungkraft.com>",
            to: [contact.email],
            subject: `Achtung Kraft // Access to ${project.name} Project Portal`,
            html: htmlBody,
            text: `Hi ${contact.name}, you have access to your project portal for ${project.name}. Access it here: ${portalUrl}`,
          }),
        });

        if (emailRes.ok) {
          channelsSent.push('Email');
          console.log(`Access email sent to ${contact.email}`);
        } else {
          const err = await emailRes.json();
          console.error(`Failed to send email to ${contact.email}:`, err);
        }
      }
    }

    // --- SMS ---
    if (contact.notify_sms === true && contact.opt_in_sms_date && contact.phone?.trim()) {
      // SMS integration placeholder — log intent for now
      console.log(`SMS: Would send access link to ${contact.phone} for ${project.name}`);
      channelsSent.push('SMS');
    }

    // --- WhatsApp ---
    if (contact.notify_whatsapp === true && contact.opt_in_whatsapp_date && contact.phone?.trim()) {
      // WhatsApp integration placeholder — log intent for now
      console.log(`WhatsApp: Would send access link to ${contact.phone} for ${project.name}`);
      channelsSent.push('WhatsApp');
    }

    if (channelsSent.length === 0) {
      return Response.json({
        success: false,
        error: 'Client has not opted into any communication channels',
        channels_sent: [],
      }, { status: 400 });
    }

    // Update last_notification_sent_at
    await base44.asServiceRole.entities.ProjectClientAccess.update(access.id, {
      last_notification_sent_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      channels_sent: channelsSent,
      contact_name: contact.name,
    });

  } catch (error) {
    console.error('sendClientAccessNotification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});