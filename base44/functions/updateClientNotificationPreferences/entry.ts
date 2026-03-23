import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

/**
 * updateClientNotificationPreferences
 * 
 * Public API endpoint callable from external Client Portal app.
 * Allows clients to manage their own notification preferences.
 * 
 * Auth: via clientSlug or shareToken (no user auth required — this is for external clients)
 * 
 * Inputs:
 * - clientSlug OR shareToken (required — at least one)
 * - notify_email (boolean, optional)
 * - notify_sms (boolean, optional)
 * - notify_whatsapp (boolean, optional)
 * - phone (string, optional — required if SMS or WhatsApp enabled)
 * - opt_in_source (string, optional — "admin" or "client", defaults to "client")
 * - opt_in_method (string, optional — "portal", "admin", or "import", defaults to "portal")
 * - ip_address (string, optional — explicit IP override for compliance)
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
    const payload = await req.json();
    const { clientSlug, shareToken, notify_email, notify_sms, notify_whatsapp, phone, opt_in_source: explicitSource, opt_in_method: explicitMethod, ip_address: explicitIp } = payload;

    // Resolve opt-in metadata with defaults
    const resolvedSource = (explicitSource === 'admin' || explicitSource === 'client') ? explicitSource : 'client';
    const resolvedMethod = (['portal', 'admin', 'import'].includes(explicitMethod)) ? explicitMethod : 'portal';

    // Require at least one identification method
    if (!clientSlug && !shareToken) {
      return Response.json({ error: 'clientSlug or shareToken is required' }, { status: 400 });
    }

    // Resolve the client contact
    let contact = null;

    if (clientSlug) {
      const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: clientSlug });
      contact = contacts[0];
    }

    if (!contact && shareToken) {
      // Look up via ProjectClientAccess → then resolve ClientContact
      const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ share_token: shareToken });
      const access = accesses[0];
      if (access?.client_contact_id) {
        const contacts = await base44.asServiceRole.entities.ClientContact.filter({ id: access.client_contact_id });
        contact = contacts[0];
      }
    }

    if (!contact) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    // Build update payload — only include fields that were explicitly provided
    const updateData = {};
    let hasChanges = false;
    const now = new Date().toISOString();

    // Capture IP for compliance — explicit override takes precedence
    const clientIp = explicitIp
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || null;

    // Phone validation guard — must have phone if enabling SMS or WhatsApp
    const effectiveSms = notify_sms !== undefined ? !!notify_sms : (contact.notify_sms ?? false);
    const effectiveWhatsapp = notify_whatsapp !== undefined ? !!notify_whatsapp : (contact.notify_whatsapp ?? false);
    const effectivePhone = phone !== undefined ? phone : (contact.phone || '');

    if ((effectiveSms || effectiveWhatsapp) && !effectivePhone?.trim()) {
      return Response.json({ error: 'Phone number is required when SMS or WhatsApp notifications are enabled' }, { status: 400 });
    }

    if (notify_email !== undefined) {
      updateData.notify_email = !!notify_email;
      // Record opt-in timestamp when toggled ON and no existing date
      if (!!notify_email && !contact.opt_in_email_date) {
        updateData.opt_in_email_date = now;
      }
      // Do NOT clear opt_in_email_date when toggled OFF (preserve history)
      hasChanges = true;
    }
    if (notify_sms !== undefined) {
      updateData.notify_sms = !!notify_sms;
      if (!!notify_sms && !contact.opt_in_sms_date) {
        updateData.opt_in_sms_date = now;
      }
      hasChanges = true;
    }
    if (notify_whatsapp !== undefined) {
      updateData.notify_whatsapp = !!notify_whatsapp;
      if (!!notify_whatsapp && !contact.opt_in_whatsapp_date) {
        updateData.opt_in_whatsapp_date = now;
      }
      hasChanges = true;
    }
    if (phone !== undefined) {
      updateData.phone = phone;
      hasChanges = true;
    }

    if (!hasChanges) {
      return Response.json({ error: 'No preferences provided to update' }, { status: 400 });
    }

    // Set opt-in metadata for any channel that was newly toggled ON
    const anyOptIn = (notify_email === true && !contact.opt_in_email_date)
      || (notify_sms === true && !contact.opt_in_sms_date)
      || (notify_whatsapp === true && !contact.opt_in_whatsapp_date);

    if (anyOptIn) {
      updateData.opt_in_source = resolvedSource;
      updateData.opt_in_method = resolvedMethod;
      if (clientIp) {
        updateData.opt_in_ip_address = clientIp;
      }
    }

    // Always track last change source
    updateData.last_opt_in_source = resolvedSource;

    // Apply update
    await base44.asServiceRole.entities.ClientContact.update(contact.id, updateData);

    return Response.json({
      success: true,
      contact_id: contact.id,
      updated_preferences: {
        notify_email: updateData.notify_email ?? contact.notify_email ?? true,
        notify_sms: updateData.notify_sms ?? contact.notify_sms ?? false,
        notify_whatsapp: updateData.notify_whatsapp ?? contact.notify_whatsapp ?? false,
        phone: updateData.phone ?? contact.phone ?? null,
        last_opt_in_source: 'client',
      },
    });

  } catch (error) {
    console.error('updateClientNotificationPreferences error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});