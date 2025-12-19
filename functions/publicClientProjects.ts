import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    // Enable CORS for cross-origin requests
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
        
        // Handle both direct POST and SDK invoke
        if (req.method === 'POST') {
            const body = await req.json();
            token = body.token;
            slug = body.slug;
        } else {
            // For SDK invoke, parameters come from query or body
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

        // Find client contact
        let clientContactId;
        
        if (slug) {
            const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true });
            if (contacts.length === 0) {
                return Response.json({ error: 'Invalid slug' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = contacts[0].id;
        } else {
            const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ share_token: token, access_status: 'active' });
            if (accesses.length === 0) {
                return Response.json({ error: 'Invalid token' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = accesses[0].client_contact_id;
        }

        const contacts = await base44.asServiceRole.entities.ClientContact.filter({ id: clientContactId });
        const contact = contacts[0];

        if (!contact) {
            return Response.json({ error: 'Contact not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            client_contact_id: clientContactId,
            access_status: 'active'
        });

        const projectIds = accesses.map(a => a.project_id);
        const projectPromises = projectIds.map(id => 
            base44.asServiceRole.entities.Project.filter({ id })
        );
        const projectResults = await Promise.all(projectPromises);
        const projects = projectResults.flat();

        const statuses = await base44.asServiceRole.entities.StatusList.list();
        const projectTypes = await base44.asServiceRole.entities.ProjectType.list();

        return Response.json({
            success: true,
            contact,
            accesses,
            projects,
            statuses: statuses.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
            projectTypes: projectTypes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
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