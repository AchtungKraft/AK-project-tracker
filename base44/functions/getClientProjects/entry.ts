import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { token, slug } = await req.json();

        if (!token && !slug) {
            return Response.json({ error: 'Missing token or slug' }, { status: 400 });
        }

        // Find client contact
        let clientContactId;
        
        if (slug) {
            const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true });
            if (contacts.length === 0) {
                return Response.json({ error: 'Invalid slug' }, { status: 403 });
            }
            clientContactId = contacts[0].id;
        } else {
            // Find by token
            const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ share_token: token, access_status: 'active' });
            if (accesses.length === 0) {
                return Response.json({ error: 'Invalid token' }, { status: 403 });
            }
            clientContactId = accesses[0].client_contact_id;
        }

        // Fetch client contact
        const contacts = await base44.asServiceRole.entities.ClientContact.filter({ id: clientContactId });
        const contact = contacts[0];

        if (!contact) {
            return Response.json({ error: 'Contact not found' }, { status: 404 });
        }

        // Fetch all active accesses for this client
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            client_contact_id: clientContactId,
            access_status: 'active'
        });

        // Fetch projects
        const projectIds = accesses.map(a => a.project_id);
        const projectPromises = projectIds.map(id => 
            base44.asServiceRole.entities.Project.filter({ id })
        );
        const projectResults = await Promise.all(projectPromises);
        const projects = projectResults.flat();

        // Fetch statuses and types
        const statuses = await base44.asServiceRole.entities.StatusList.list();
        const projectTypes = await base44.asServiceRole.entities.ProjectType.list();

        return Response.json({
            success: true,
            contact,
            accesses,
            projects,
            statuses: statuses.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
            projectTypes: projectTypes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        });

    } catch (error) {
        console.error("Error in getClientProjects:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});