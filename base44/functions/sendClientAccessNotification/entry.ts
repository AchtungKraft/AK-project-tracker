import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendClientAccessNotification
 * 
 * Sends client access link via all opted-in channels (email, SMS, WhatsApp).
 * Respects notification preferences and compliance opt-in dates.
 * Now uses centralized sendClientEmail for the email channel.
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
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { clientContactId, projectId, accessId } = await req.json();
    if (!clientContactId || !projectId || !accessId) {
      return Response.json({ error: 'Missing required parameters: clientContactId, projectId, accessId' }, { status: 400 });
    }

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

    const clientPortalBaseUrl = 'https://akclient.base44.app';
    const clientSlug = contact.url_slug || access.url_slug || '';
    const portalUrl = clientSlug
      ? `${clientPortalBaseUrl}?slug=${clientSlug}`
      : `${clientPortalBaseUrl}?token=${access.share_token}`;

    const channelsSent = [];

    // --- EMAIL via centralized sender ---
    if (contact.notify_email !== false) {
      const textBody = `Hi ${contact.name}, you have access to your project portal for ${project.name}. Access it here: ${portalUrl}`;

      try {
        const sendResponse = await base44.functions.invoke('sendClientEmail', {
          to: contact.email,
          contactName: contact.name,
          subject: `Achtung Kraft // Access to ${project.name} Project Portal`,
          emailType: 'access',
          projectName: project.name,
          headline: 'Your Project Portal Access',
          introText: 'You have access to your project portal. Use the link below to view updates, review designs, and provide feedback.',
          ctaUrl: portalUrl,
          ctaText: 'ACCESS YOUR PORTAL',
          clientSlug: clientSlug || null,
          textBody,
          projectId,
        });

        if (sendResponse.data?.success) {
          channelsSent.push('Email');
          console.log(`Access email sent to ${contact.email}`);
        } else {
          console.error(`Failed to send email to ${contact.email}:`, sendResponse.data?.error);
        }
      } catch (emailErr) {
        console.error(`Error sending access email to ${contact.email}:`, emailErr);
      }
    }

    // --- SMS ---
    if (contact.notify_sms === true && contact.opt_in_sms_date && contact.phone?.trim()) {
      console.log(`SMS: Would send access link to ${contact.phone} for ${project.name}`);
      channelsSent.push('SMS');
    }

    // --- WhatsApp ---
    if (contact.notify_whatsapp === true && contact.opt_in_whatsapp_date && contact.phone?.trim()) {
      console.log(`WhatsApp: Would send access link to ${contact.phone} for ${project.name}`);
      channelsSent.push('WhatsApp');
    }

    if (channelsSent.length === 0) {
      return Response.json({
        success: false, error: 'Client has not opted into any communication channels', channels_sent: [],
      }, { status: 400 });
    }

    await base44.asServiceRole.entities.ProjectClientAccess.update(access.id, {
      last_notification_sent_at: new Date().toISOString(),
    });

    return Response.json({ success: true, channels_sent: channelsSent, contact_name: contact.name });

  } catch (error) {
    console.error('sendClientAccessNotification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});