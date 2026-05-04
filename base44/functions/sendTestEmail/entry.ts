import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
            client_slug: "test-client-abc123",
            item_count: 3,
        };

        // Get saved template or use defaults
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: templateKey });
        const savedTemplate = templates[0];

        const defaultTemplates = {
            needs_review: { subject: "Achtung Kraft // REVIEW NEEDED: {request_title}", body_intro: "You have a new item that requires your review:", button_text: "VIEW & APPROVE REQUEST" },
            bulk_review: { subject: "Achtung Kraft // {item_count} ITEMS NEED YOUR REVIEW: {project_name}", body_intro: "You have {item_count} item(s) that need your review:", button_text: "VIEW ALL ITEMS" },
            journal_entry: { subject: "Achtung Kraft // New Update: {headline}", body_intro: "There's a new update on your project:", button_text: "VIEW FULL UPDATE" },
            status_update: { subject: "Achtung Kraft // Request Update: {request_title}", body_intro: "The request has been updated.", button_text: "VIEW REQUEST" },
            welcome: { subject: "Achtung Kraft // Welcome to {project_name} Project Portal", body_intro: "Welcome! You've been given access to the project portal.", button_text: "ACCESS YOUR PORTAL" },
        };

        const tpl = defaultTemplates[templateKey];
        if (!tpl) return Response.json({ error: 'Unknown template' }, { status: 400 });

        // Replace placeholders
        let subject = (savedTemplate?.subject_template || tpl.subject)
            .replace(/{project_name}/g, testData.project_name)
            .replace(/{request_title}/g, testData.request_title)
            .replace(/{headline}/g, testData.headline)
            .replace(/{item_count}/g, testData.item_count)
            .replace(/{client_slug}/g, testData.client_slug)
            .replace(/{client_name}/g, testData.client_name);

        const bodyIntro = (savedTemplate?.body_intro || tpl.body_intro)
            .replace(/{item_count}/g, testData.item_count)
            .replace(/{client_name}/g, testData.client_name)
            .replace(/{project_name}/g, testData.project_name);

        const buttonText = savedTemplate?.button_text || tpl.button_text;

        // Build test-specific content
        const contentBlockHtml = `<h3 style="margin:0 0 8px 0;color:#c00;">${testData.request_title}</h3><p style="margin:0;color:#333;white-space:pre-wrap;">${testData.request_body}</p>`;

        let statusChangeHtml = null;
        if (templateKey === 'status_update') {
            statusChangeHtml = `<p style="color:#333;">Status changed from <strong>${testData.old_status}</strong> to <strong>${testData.new_status}</strong>.</p>`;
        }

        let itemsListHtml = null;
        if (templateKey === 'bulk_review') {
            itemsListHtml = [
                '<li style="margin-bottom:12px;padding:12px;background-color:#f9f9f9;border-left:4px solid #c00;"><strong style="color:#333;">Engine Bay Layout Approval</strong><br><span style="color:#666;font-size:14px;">approval</span></li>',
                '<li style="margin-bottom:12px;padding:12px;background-color:#f9f9f9;border-left:4px solid #c00;"><strong style="color:#333;">Interior Color Selection</strong><br><span style="color:#666;font-size:14px;">review</span></li>',
                '<li style="margin-bottom:12px;padding:12px;background-color:#f9f9f9;border-left:4px solid #c00;"><strong style="color:#333;">Wheel Design Options</strong><br><span style="color:#666;font-size:14px;">image review</span></li>',
            ].join('');
        }

        // Prepend TEST banner as intro
        const testBannerIntro = `<span style="background:#fff3cd;border:1px solid #ffc107;padding:6px 10px;border-radius:4px;color:#856404;font-size:13px;">⚠️ <strong>TEST EMAIL</strong> — Sent from the admin screen.</span><br><br>${bodyIntro}`;

        // Use centralized sender
        const sendResponse = await base44.functions.invoke('sendClientEmail', {
            to,
            contactName: testData.client_name,
            subject: `[TEST] ${subject}`,
            emailType: `test_${templateKey}`,
            projectName: testData.project_name,
            headline: subject.replace('Achtung Kraft // ', ''),
            introText: testBannerIntro,
            contentBlockHtml,
            statusChangeHtml,
            itemsListHtml,
            ctaUrl: '#',
            ctaText: buttonText,
            clientSlug: testData.client_slug,
        });

        if (!sendResponse.data?.success) {
            return Response.json({ error: 'Failed to send email', details: sendResponse.data?.error }, { status: 500 });
        }

        console.log(`Test email sent to ${to} for template ${templateKey}. ID: ${sendResponse.data.emailId}`);
        return Response.json({ success: true, emailId: sendResponse.data.emailId });

    } catch (error) {
        console.error("Error in sendTestEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});