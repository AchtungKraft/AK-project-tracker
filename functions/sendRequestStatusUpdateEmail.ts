import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse payload
        const { requestId, oldStatus, newStatus } = await req.json();

        if (!requestId || !newStatus) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Only send if status actually changed
        if (oldStatus === newStatus) {
            return Response.json({ message: 'Status did not change, no email sent' });
        }

        // Fetch Request details
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];

        if (!request) {
            return Response.json({ error: 'Request not found' }, { status: 404 });
        }

        // Fetch Project details
        const projects = await base44.asServiceRole.entities.Project.filter({ id: request.project_id });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Collect Recipient Emails
        const recipients = new Set();

        // 1. Client Email from Project (Legacy/Main)
        if (project.client_email) {
            recipients.add(project.client_email);
        }

        // 2. Client Contacts with Access to Project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id,
            access_status: 'active'
        });
        
        const clientContactIds = accesses.map(a => a.client_contact_id);
        if (clientContactIds.length > 0) {
            // Fetch contacts manually as we don't have bulk fetch by ID list easily without loop or complex filter
            // Assuming filter supports $in or similar or just loop
            // Standard entity filter is often simple. Let's loop for safety or use filter if supported.
            // Base44 filter: { id: { $in: [...] } } or just loop. The SDK instructions don't explicitly show $in support for 'filter'. 
            // It says "Query filter (e.g. {"id": "123"}, {"status": "active"}, {"age": {"$gte": 18}})"
            // So let's try Promise.all for parallel fetch which is fast enough for small numbers.
            const contactPromises = clientContactIds.map(id => 
                base44.asServiceRole.entities.ClientContact.filter({ id })
            );
            const contactResults = await Promise.all(contactPromises);
            contactResults.flat().forEach(contact => {
                if (contact && contact.email) recipients.add(contact.email);
            });
        }

        // 3. Team Members Assigned to Project
        if (project.assigned_team && Array.isArray(project.assigned_team) && project.assigned_team.length > 0) {
             const teamPromises = project.assigned_team.map(id => 
                base44.asServiceRole.entities.TeamMember.filter({ id })
            );
            const teamResults = await Promise.all(teamPromises);
            teamResults.flat().forEach(member => {
                if (member && member.email) recipients.add(member.email);
            });
        }

        if (recipients.size === 0) {
            console.log(`No recipients found for project ${project.id}. Skipping email.`);
            return Response.json({ message: 'No recipients found' });
        }

        const toAddresses = Array.from(recipients);

        // Prepare email content
        const appBaseUrl = Deno.env.get("APP_BASE_URL") || 'https://projects.achtungkraft.com'; 
        
        const subject = `Request update: ${request.title}`;
        
        // Using a generic greeting since there are multiple recipients
        const htmlBody = `
<p>Hello,</p>

<p>The request <strong>${request.title}</strong> has been updated.</p>

<p>
Status changed from <strong>${oldStatus || 'unknown'}</strong>
to <strong>${newStatus}</strong>.
</p>

<p>
You can view the request details here:<br />
<a href="${appBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}">
View Request
</a>
</p>

<p>
— Achtung Kraft
</p>
`;

        const textBody = `
The request "${request.title}" has been updated.

Status changed from ${oldStatus || 'unknown'} to ${newStatus}.

View details:
${appBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}
`;

        // Send email via Resend
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
             console.error("RESEND_API_KEY not set");
             return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: "Achtung Kraft Projects <updates@projects.achtungkraft.com>",
                to: toAddresses, 
                subject: subject,
                html: htmlBody,
                text: textBody
            })
        });

        if (!emailResponse.ok) {
            const errorData = await emailResponse.json();
            console.error("Resend API Error:", errorData);
            return Response.json({ error: "Failed to send email", details: errorData }, { status: 500 });
        }

        const emailData = await emailResponse.json();

        console.log(`Email sent for Request ${requestId}: ${oldStatus} -> ${newStatus} to ${toAddresses.join(', ')}. ID: ${emailData.id}`);

        return Response.json({ success: true, emailId: emailData.id });

    } catch (error) {
        console.error("Error in sendRequestStatusUpdateEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});