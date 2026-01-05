import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse payload
        const { journalEntryId } = await req.json();

        if (!journalEntryId) {
            return Response.json({ error: 'Missing journalEntryId' }, { status: 400 });
        }

        // Fetch Journal Entry details
        const entries = await base44.asServiceRole.entities.JournalEntry.filter({ id: journalEntryId });
        const entry = entries[0];

        if (!entry) {
            return Response.json({ error: 'Journal entry not found' }, { status: 404 });
        }

        // Only send emails for client-visible entries
        if (entry.visibility !== 'client') {
            console.log(`Journal entry ${journalEntryId} is internal only. Skipping email.`);
            return Response.json({ message: 'Entry is internal only, no emails sent' });
        }

        // Fetch Project details
        const projects = await base44.asServiceRole.entities.Project.filter({ id: entry.project_id });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Get all active client accesses for this project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: entry.project_id,
            access_status: 'active'
        });

        if (accesses.length === 0) {
            console.log(`No active client accesses found for project ${project.id}. Skipping email.`);
            return Response.json({ message: 'No active clients found' });
        }

        // Fetch all client contacts
        const clientContactIds = accesses.map(a => a.client_contact_id);
        const contactPromises = clientContactIds.map(id => 
            base44.asServiceRole.entities.ClientContact.filter({ id })
        );
        const contactResults = await Promise.all(contactPromises);
        const contacts = contactResults.flat().filter(Boolean);

        if (contacts.length === 0) {
            console.log(`No client contacts found for project ${project.id}. Skipping email.`);
            return Response.json({ message: 'No client contacts found' });
        }

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        
        if (!resendApiKey) {
            console.error("RESEND_API_KEY not set");
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        // Send personalized email to each client
        const emailPromises = contacts.map(async (contact) => {
            // Find the access record for this contact
            const access = accesses.find(a => a.client_contact_id === contact.id);
            if (!access) return null;

            // Build the direct journal URL with slug or token
            let journalUrl;
            if (contact.url_slug) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&slug=${contact.url_slug}&tab=journal`;
            } else if (access.url_slug) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&slug=${access.url_slug}&tab=journal`;
            } else if (access.share_token) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&token=${access.share_token}&tab=journal`;
            } else {
                console.warn(`No slug or token for contact ${contact.id}, skipping email`);
                return null;
            }

            const subject = `Achtung Kraft // New Update: ${entry.headline || project.name}`;

            // Truncate content for email preview
            const contentPreview = entry.content.length > 500 
                ? entry.content.substring(0, 500) + '...' 
                : entry.content;

            const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">New Update: ${entry.headline || 'Project Journal'}</h2>

<p>Hi ${contact.name},</p>

<p>There's a new update on your project:</p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    ${entry.headline ? `<h3 style="margin: 0 0 12px 0; color: #c00;">${entry.headline}</h3>` : ''}
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${contentPreview}</p>
</div>

<p style="margin: 30px 0;">
<a href="${journalUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
VIEW FULL UPDATE
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="${journalUrl}" style="color: #3b82f6;">${journalUrl}</a>
</p>

<p>
— Achtung Kraft Projects
</p>
`;

            const textBody = `
PROJECT: ${project.name}
New Update: ${entry.headline || 'Project Journal'}

Hi ${contact.name},

There's a new update on your project:

${entry.headline ? entry.headline + '\n\n' : ''}${contentPreview}

View the full update here:
${journalUrl}

— Achtung Kraft Projects
`;

            // Send individual email
            const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: "Achtung Kraft Projects <updates@projects.achtungkraft.com>",
                    to: [contact.email],
                    subject: subject,
                    html: htmlBody,
                    text: textBody
                })
            });

            if (!emailResponse.ok) {
                const errorData = await emailResponse.json();
                console.error(`Failed to send email to ${contact.email}:`, errorData);
                return { contact: contact.email, success: false, error: errorData };
            }

            const emailData = await emailResponse.json();
            console.log(`Journal email sent to ${contact.email} for entry ${journalEntryId}. ID: ${emailData.id}`);
            return { contact: contact.email, success: true, emailId: emailData.id };
        });

        const results = await Promise.all(emailPromises);
        const successfulEmails = results.filter(r => r && r.success);

        return Response.json({ 
            success: true, 
            emailsSent: successfulEmails.length,
            results: results.filter(Boolean)
        });

    } catch (error) {
        console.error("Error in sendJournalEntryEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});