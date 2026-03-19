import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
        let token, slug;
        
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
            }
        } catch (e) {
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
        }

        if (!token && !slug) {
            return Response.json({ error: 'Missing token or slug' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        let clientContactId;
        let contact;
        
        if (slug) {
            const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true });
            if (contacts.length === 0) {
                return Response.json({ error: 'Invalid slug' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            contact = contacts[0];
            clientContactId = contact.id;
        } else {
            const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ share_token: token, access_status: 'active' });
            if (accesses.length === 0) {
                return Response.json({ error: 'Invalid token' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = accesses[0].client_contact_id;
            
            const contacts = await base44.asServiceRole.entities.ClientContact.filter({ id: clientContactId });
            contact = contacts[0];
        }

        if (!contact) {
            return Response.json({ error: 'Contact not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Fetch accesses, statuses, and project types in parallel
        const [accesses, statuses, projectTypes] = await Promise.all([
            base44.asServiceRole.entities.ProjectClientAccess.filter({ 
                client_contact_id: clientContactId,
                access_status: 'active'
            }),
            base44.asServiceRole.entities.StatusList.filter({ scope: 'Project', active: true }),
            base44.asServiceRole.entities.ProjectType.filter({ active: true })
        ]);

        // Fetch all projects in a single query using $in operator
        const projectIds = accesses.map(a => a.project_id);
        const projects = projectIds.length > 0 
            ? await base44.asServiceRole.entities.Project.filter({ id: { $in: projectIds } })
            : [];

        // Return minimal data
        const minimalContact = {
            id: contact.id,
            name: contact.name,
            email: contact.email
        };

        const minimalAccesses = accesses.map(a => ({
            id: a.id,
            project_id: a.project_id,
            access_role: a.access_role
        }));

        const minimalProjects = projects.map(p => ({
            id: p.id,
            name: p.name,
            featured_image_url: p.featured_image_url,
            status_id: p.status_id,
            project_type_id: p.project_type_id,
            progress_percent: p.progress_percent
        }));

        const minimalStatuses = statuses
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map(s => ({
                id: s.id,
                label: s.label,
                color: s.color
            }));

        const minimalProjectTypes = projectTypes
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map(t => ({
                id: t.id,
                name: t.name,
                color: t.color
            }));

        return Response.json({
            success: true,
            contact: minimalContact,
            accesses: minimalAccesses,
            projects: minimalProjects,
            statuses: minimalStatuses,
            projectTypes: minimalProjectTypes
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicClientProjects:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});