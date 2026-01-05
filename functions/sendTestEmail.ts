import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { templateKey, to } = await req.json();

        if (!templateKey || !to) {
            return Response.json({ error: 'Missing templateKey or to' }, { status: 400 });
        }

        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        // Sample data for test emails
        const testData = {
            project_name: "1967 Mustang Fastback Build",
            request_title: "Engine Bay Layout Approval",
            request_body: "Please review the proposed engine bay layout and wire routing. We've optimized the placement for better heat management.",
            headline: "Suspension Installation Complete",
            content_preview: "We've finished installing the coilover suspension system. The car now sits at the perfect stance height.",
            old_status: "posted",
            new_status: "approved",
            client_name: "Test Client",
            item_count: 3,
        };

        // Get saved template or use defaults
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: templateKey });
        const savedTemplate = templates[0];

        const defaultTemplates = {
            needs_review: {
                subject: "Achtung Kraft // REVIEW NEEDED: {request_title}",
                body_intro: "You have a new item that requires your review:",
                button_text: "VIEW & APPROVE REQUEST",
                closing_text: "— Achtung Kraft Projects",
            },
            bulk_review: {
                subject: "Achtung Kraft // {item_count} ITEMS NEED YOUR REVIEW: {project_name}",
                body_intro: "You have {item_count} item(s) that need your review:",
                button_text: "VIEW ALL ITEMS",
                closing_text: "— Achtung Kraft Projects",
            },
            journal_entry: {
                subject: "Achtung Kraft // New Update: {headline}",
                body_intro: "There's a new update on your project:",
                button_text: "VIEW FULL UPDATE",
                closing_text: "— Achtung Kraft Projects",
            },
            status_update: {
                subject: "Achtung Kraft // Request Update: {request_title}",
                body_intro: "The request has been updated.",
                button_text: "VIEW REQUEST",
                closing_text: "— Achtung Kraft Projects",
            },
            welcome: {
                subject: "Achtung Kraft // Welcome to {project_name} Project Portal",
                body_intro: "Welcome! You've been given access to the project portal.",
                button_text: "ACCESS YOUR PORTAL",
                closing_text: "— Achtung Kraft Projects",
            },
        };

        const template = savedTemplate || defaultTemplates[templateKey];
        if (!template) {
            return Response.json({ error: 'Unknown template' }, { status: 400 });
        }

        // Replace placeholders in subject
        let subject = savedTemplate?.subject_template || defaultTemplates[templateKey].subject;
        subject = subject
            .replace(/{project_name}/g, testData.project_name)
            .replace(/{request_title}/g, testData.request_title)
            .replace(/{headline}/g, testData.headline)
            .replace(/{item_count}/g, testData.item_count);

        const bodyIntro = (savedTemplate?.body_intro || defaultTemplates[templateKey].body_intro)
            .replace(/{item_count}/g, testData.item_count);
        const buttonText = savedTemplate?.button_text || defaultTemplates[templateKey].button_text;
        const closingText = savedTemplate?.closing_text || defaultTemplates[templateKey].closing_text;

        // Build HTML body
        const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${testData.project_name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">${subject.replace('Achtung Kraft // ', '')}</h2>

<p style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 4px; color: #856404;">
⚠️ <strong>TEST EMAIL</strong> - This is a test email sent from the Email Templates admin screen.
</p>

<p>Hi ${testData.client_name},</p>

<p>${bodyIntro}</p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #c00;">${testData.request_title}</h3>
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${testData.request_body}</p>
</div>

${templateKey === 'bulk_review' ? `
<ul style="list-style: none; padding: 0; margin: 20px 0;">
    <li style="margin-bottom: 12px; padding: 12px; background-color: #f9f9f9; border-left: 4px solid #c00;">
        <strong style="color: #333;">Engine Bay Layout Approval</strong>
        <br><span style="color: #666; font-size: 14px;">approval</span>
    </li>
    <li style="margin-bottom: 12px; padding: 12px; background-color: #f9f9f9; border-left: 4px solid #c00;">
        <strong style="color: #333;">Interior Color Selection</strong>
        <br><span style="color: #666; font-size: 14px;">review</span>
    </li>
    <li style="margin-bottom: 12px; padding: 12px; background-color: #f9f9f9; border-left: 4px solid #c00;">
        <strong style="color: #333;">Wheel Design Options</strong>
        <br><span style="color: #666; font-size: 14px;">image review</span>
    </li>
</ul>
` : ''}

${templateKey === 'status_update' ? `
<p>
Status changed from <strong>${testData.old_status}</strong>
to <strong>${testData.new_status}</strong>.
</p>
` : ''}

<p style="margin: 30px 0;">
<a href="#" style="display: inline-block; background-color: #c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
${buttonText}
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="#" style="color: #3b82f6;">https://akclient.base44.app/...</a>
</p>

<p>
${closingText}
</p>
`;

        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: "Achtung Kraft Projects <updates@projects.achtungkraft.com>",
                to: [to],
                subject: `[TEST] ${subject}`,
                html: htmlBody,
            })
        });

        if (!emailResponse.ok) {
            const errorData = await emailResponse.json();
            console.error('Failed to send test email:', errorData);
            return Response.json({ error: 'Failed to send email', details: errorData }, { status: 500 });
        }

        const emailData = await emailResponse.json();
        console.log(`Test email sent to ${to} for template ${templateKey}. ID: ${emailData.id}`);

        return Response.json({ success: true, emailId: emailData.id });

    } catch (error) {
        console.error("Error in sendTestEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});