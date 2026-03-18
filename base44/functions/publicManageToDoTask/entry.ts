import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
        const body = await req.json();
        const { token, slug, requestId, action, task } = body;

        if (!requestId || !action) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Verify request exists
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];
        if (!request || request.request_type !== 'todo_list') {
            return Response.json({ error: 'Invalid request' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Check if internal user (authenticated) or public access (token/slug)
        let hasAccess = false;
        
        // Try authenticated user first
        try {
            const user = await base44.auth.me();
            if (user) {
                // Internal authenticated user has access
                hasAccess = true;
            }
        } catch (e) {
            // Not authenticated, will check public access
        }

        // If not authenticated internally, check public access via token/slug
        if (!hasAccess) {
            if (!token && !slug) {
                return Response.json({ error: 'Missing access credentials' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }

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
            }

            const filter = { project_id: request.project_id, access_status: 'active' };
            if (token) filter.share_token = token;
            if (clientContactId) filter.client_contact_id = clientContactId;

            const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter(filter);
            if (accesses.length === 0) {
                return Response.json({ error: 'Invalid access' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            hasAccess = true;
        }

        let result;

        switch (action) {
            case 'create':
                if (!task?.title) {
                    return Response.json({ error: 'Task title is required' }, { 
                        status: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' }
                    });
                }
                result = await base44.asServiceRole.entities.ToDoListTask.create({
                    request_id: requestId,
                    title: task.title,
                    is_complete: false,
                    assigned_to_id: task.assigned_to_id || null,
                    assigned_to_type: task.assigned_to_type || null,
                    details: task.details || null,
                    images: task.images || null,
                    due_date: task.due_date || null
                });
                break;

            case 'update':
                if (!task?.id) {
                    return Response.json({ error: 'Task ID is required' }, { 
                        status: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' }
                    });
                }
                // Verify task belongs to this request
                const existingTasks = await base44.asServiceRole.entities.ToDoListTask.filter({ id: task.id });
                if (existingTasks.length === 0 || existingTasks[0].request_id !== requestId) {
                    return Response.json({ error: 'Task not found' }, { 
                        status: 404,
                        headers: { 'Access-Control-Allow-Origin': '*' }
                    });
                }
                const updateData = {};
                if (task.title !== undefined) updateData.title = task.title;
                if (task.is_complete !== undefined) {
                    updateData.is_complete = task.is_complete;
                    // Set completed_at timestamp when marking complete, clear when unmarking
                    updateData.completed_at = task.is_complete ? new Date().toISOString() : null;
                }
                if (task.assigned_to_id !== undefined) updateData.assigned_to_id = task.assigned_to_id;
                if (task.assigned_to_type !== undefined) updateData.assigned_to_type = task.assigned_to_type;
                if (task.details !== undefined) updateData.details = task.details;
                if (task.images !== undefined) updateData.images = task.images;
                if (task.due_date !== undefined) updateData.due_date = task.due_date;
                
                result = await base44.asServiceRole.entities.ToDoListTask.update(task.id, updateData);
                break;

            case 'delete':
                if (!task?.id) {
                    return Response.json({ error: 'Task ID is required' }, { 
                        status: 400,
                        headers: { 'Access-Control-Allow-Origin': '*' }
                    });
                }
                // Verify task belongs to this request
                const tasksToDelete = await base44.asServiceRole.entities.ToDoListTask.filter({ id: task.id });
                if (tasksToDelete.length === 0 || tasksToDelete[0].request_id !== requestId) {
                    return Response.json({ error: 'Task not found' }, { 
                        status: 404,
                        headers: { 'Access-Control-Allow-Origin': '*' }
                    });
                }
                await base44.asServiceRole.entities.ToDoListTask.delete(task.id);
                result = { deleted: true };
                break;

            default:
                return Response.json({ error: 'Invalid action' }, { 
                    status: 400,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
        }

        return Response.json({
            success: true,
            result
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicManageToDoTask:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});