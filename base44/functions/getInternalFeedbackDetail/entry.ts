import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Retry wrapper for transient failures (429, network) ──────────────
async function fetchWithRetry(fn, { retries = 2, delay = 800 } = {}) {
  try {
    return await fn();
  } catch (err) {
    const msg = err?.message || '';
    const isRetryable =
      err?.status === 429 ||
      msg.includes('429') ||
      msg.includes('Too Many Requests') ||
      err?.name === 'FetchError' ||
      msg.includes('ECONNRESET');

    if (retries > 0 && isRetryable) {
      const jitter = Math.random() * 400;
      await new Promise(r => setTimeout(r, delay + jitter));
      return fetchWithRetry(fn, { retries: retries - 1, delay: delay * 2 });
    }
    throw err;
  }
}

// ── Short-term response cache (30s TTL) ──────────────────────────────
const responseCache = new Map();
function getCached(key, ttl = 3000) {
  const item = responseCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > ttl) { responseCache.delete(key); return null; }
  return item.data;
}
function setCache(key, data) {
  responseCache.set(key, { data, timestamp: Date.now() });
  // Prevent unbounded growth — evict oldest entries if cache exceeds 50 keys
  if (responseCache.size > 50) {
    const oldest = responseCache.keys().next().value;
    responseCache.delete(oldest);
  }
}

// ── Inflight request deduplication ───────────────────────────────────
// If multiple concurrent requests arrive for the same requestId,
// only one does the actual work; others await the same promise.
const inflightRequests = new Map();

// ── Batched fetch by IDs — filters non-ObjectId values ───────────────
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
async function fetchByIdsBatched(entity, ids) {
  if (!ids || ids.length === 0) return [];
  const uniqueIds = [...new Set(ids)].filter(id => OBJECT_ID_RE.test(id));
  if (uniqueIds.length === 0) return [];
  try {
    return await fetchWithRetry(() => entity.filter({ id: { $in: uniqueIds } }));
  } catch (error) {
    console.error('fetchByIdsBatched error:', error);
    return [];
  }
}

// ── Server-side comment normalizer (authoritative) ──────────────────
function normalizeComment(comment, attachmentsByCommentId) {
  // Use pre-indexed attachment lookup instead of scanning full array each time
  const commentAttachments = attachmentsByCommentId.get(comment.id) || [];

  const contentHtml = comment.content_html || null;
  const body = comment.body || '';
  const contentFallback = comment.content_fallback || body;

  let links = [];
  if (Array.isArray(comment.links) && comment.links.length > 0) {
    links = comment.links.map((link, idx) => {
      if (typeof link === 'string') {
        return { id: `legacy-${idx}`, name: link, url: link, description: null, type: 'external' };
      }
      return {
        id: link.id || `link-${idx}`,
        name: link.name || link.url || '',
        url: link.url || '',
        description:
          typeof link.description === 'string' && link.description.trim().length > 0
            ? link.description.trim()
            : null,
        type: link.type || 'external',
      };
    });
  } else {
    links = commentAttachments
      .filter(a => a.attachment_type === 'link')
      .map((a, idx) => ({
        id: a.id || `att-link-${idx}`,
        name: a.label || a.link_url || '',
        url: a.link_url || '',
        description: null,
        type: 'external',
      }));
  }

  const isSafeImage = (a) => {
    if (a.mime_type && a.mime_type.toLowerCase() === 'image/svg+xml') return false;
    return a.attachment_type === 'image';
  };
  let photos = [];
  if (Array.isArray(comment.photos) && comment.photos.length > 0) {
    photos = comment.photos.filter(Boolean);
  } else {
    photos = commentAttachments.filter(isSafeImage).map(a => a.file_url).filter(Boolean);
  }

  let files = [];
  if (Array.isArray(comment.files) && comment.files.length > 0) {
    files = comment.files.map(f => ({ name: f.name || 'File', url: f.url || '' }));
  } else {
    files = commentAttachments
      .filter(a => a.attachment_type === 'file')
      .map(a => ({ name: a.label || 'File', url: a.file_url || '' }));
  }

  return {
    id: comment.id,
    request_id: comment.request_id,
    author_type: comment.author_type,
    author_id: comment.author_id,
    content_html: contentHtml,
    content_fallback: contentFallback,
    body,
    links,
    photos,
    files,
    visibility: comment.visibility || 'client_visible',
    target_type: comment.target_type || 'request',
    target_attachment_id: comment.target_attachment_id || null,
    posted_at: comment.posted_at,
    created_date: comment.created_date,
    created_by: comment.created_by,
    author: comment.author || null,
    author_display_name: comment.author_display_name || null,
  };
}

// ── Payload field projection helpers ─────────────────────────────────
// Strip fields the frontend never reads to reduce serialization cost.
function trimAttachment(a) {
  return {
    id: a.id,
    request_id: a.request_id,
    comment_id: a.comment_id || null,
    attachment_type: a.attachment_type,
    file_url: a.file_url || null,
    link_url: a.link_url || null,
    label: a.label || null,
    sort_order: a.sort_order ?? 0,
    created_by_type: a.created_by_type,
    created_by_id: a.created_by_id,
    posted_at: a.posted_at,
    created_date: a.created_date,
    creator: null, // enriched later
  };
}

function trimDecision(d) {
  return {
    id: d.id,
    request_id: d.request_id,
    decided_by_type: d.decided_by_type,
    decided_by_id: d.decided_by_id,
    decision: d.decision,
    note: d.note || null,
    target_type: d.target_type || 'request',
    target_attachment_id: d.target_attachment_id || null,
    target_image_url: d.target_image_url || null,
    decided_at: d.decided_at,
    created_date: d.created_date,
    decider: null, // enriched later
    decider_display_name: null,
  };
}

function trimTask(t) {
  return {
    id: t.id,
    name: t.name,
    status_id: t.status_id || null,
    assigned_team_member_id: t.assigned_team_member_id || null,
    project_id: t.project_id,
    is_priority: t.is_priority || false,
    due_date: t.due_date || null,
    completed_date: t.completed_date || null,
  };
}

function trimTodoTask(t) {
  return {
    id: t.id,
    request_id: t.request_id,
    group_id: t.group_id || null,
    title: t.title,
    is_complete: t.is_complete || false,
    completed_at: t.completed_at || null,
    assigned_to_id: t.assigned_to_id || null,
    assigned_to_type: t.assigned_to_type || null,
    details: t.details || null,
    images: t.images || [],
    due_date: t.due_date || null,
    order: t.order ?? 0,
    created_date: t.created_date,
    assignee: null, // enriched later
  };
}

// ── Core processing logic (shared by coalesced requests) ─────────────
async function processRequest(base44, requestId, projectId) {
  const timings = {};
  const metrics = { entityReads: 0, cacheHit: false };
  const t0 = Date.now();

  // ── STEP 1: Fetch request first for early exit ─────────────────────
  const tReq = Date.now();
  const requests = await fetchWithRetry(() =>
    base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId })
  );
  metrics.entityReads++;
  timings.requestFetch = Date.now() - tReq;

  const request = requests[0];
  if (!request) {
    return {
      success: false,
      data: null,
      error: { type: 'NOT_FOUND', message: 'Request not found' },
      _status: 404,
    };
  }

  const projectIdForAccess = request.project_id || projectId;

  // ── STEP 2: Fetch ALL request-scoped entities in parallel ──────────
  // Using Promise.all directly — these are independent entity reads, no
  // need for throttled runBatched which added 150ms×N artificial latency.
  const tBatch1 = Date.now();
  const [
    commentsRaw,
    decisionsRaw,
    attachmentsRaw,
    todoTasksRaw,
    linkedTasks,
    taskGroupsRaw,
    projectArr,
    projectClientAccesses,
  ] = await Promise.all([
    fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId })),
    fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId })),
    fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId })),
    fetchWithRetry(() => base44.asServiceRole.entities.ToDoListTask.filter({ request_id: requestId })).catch(() => []),
    fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId })),
    fetchWithRetry(() => base44.asServiceRole.entities.TaskGroup.filter({ request_id: requestId })).catch(() => []),
    projectIdForAccess
      ? fetchWithRetry(() => base44.asServiceRole.entities.Project.filter({ id: projectIdForAccess }))
      : Promise.resolve([]),
    projectIdForAccess
      ? fetchWithRetry(() => base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: projectIdForAccess }))
      : Promise.resolve([]),
  ]);
  metrics.entityReads += 8;
  timings.batch1 = Date.now() - tBatch1;

  // ── STEP 3: Build attachment index ONCE (used by normalizeComment) ─
  const attachmentsByCommentId = new Map();
  for (const a of attachmentsRaw) {
    if (a.comment_id) {
      let list = attachmentsByCommentId.get(a.comment_id);
      if (!list) { list = []; attachmentsByCommentId.set(a.comment_id, list); }
      list.push(a);
    }
  }

  // ── STEP 4: Derive minimal ID sets from request-scoped data ────────
  const internalUserIds = new Set();
  const clientContactIds = new Set();
  const taskIds = new Set();

  if (request.created_by_user_id) internalUserIds.add(request.created_by_user_id);

  for (const c of commentsRaw) {
    if (c.author_type === 'internal_user' && c.author_id) internalUserIds.add(c.author_id);
    else if (c.author_type === 'client_contact' && c.author_id) clientContactIds.add(c.author_id);
  }
  for (const d of decisionsRaw) {
    if (d.decided_by_type === 'internal_user' && d.decided_by_id) internalUserIds.add(d.decided_by_id);
    else if (d.decided_by_type === 'client_contact' && d.decided_by_id) clientContactIds.add(d.decided_by_id);
  }
  for (const a of attachmentsRaw) {
    if (a.created_by_type === 'internal_user' && a.created_by_id) internalUserIds.add(a.created_by_id);
    else if (a.created_by_type === 'client_contact' && a.created_by_id) clientContactIds.add(a.created_by_id);
  }
  for (const t of todoTasksRaw) {
    if (t.assigned_to_type === 'internal_user' && t.assigned_to_id) internalUserIds.add(t.assigned_to_id);
    else if (t.assigned_to_type === 'client_contact' && t.assigned_to_id) clientContactIds.add(t.assigned_to_id);
  }
  for (const link of linkedTasks) {
    if (link.task_id) taskIds.add(link.task_id);
  }

  // Include access contact IDs so we fetch ALL contacts in one batch
  const activeAccesses = projectClientAccesses.filter(pa => pa.access_status === 'active');
  for (const pa of activeAccesses) {
    if (pa.client_contact_id) clientContactIds.add(pa.client_contact_id);
  }

  // ── STEP 5: Fetch people + tasks + teamMembers ALL IN PARALLEL ─────
  // TeamMembers are fetched here so we can fold AK user IDs into one
  // combined $in query — eliminates the previous follow-up fetch round.
  const tBatch2 = Date.now();
  const [clientContacts, tasks, teamMembers] = await Promise.all([
    fetchByIdsBatched(base44.asServiceRole.entities.ClientContact, [...clientContactIds]),
    fetchByIdsBatched(base44.asServiceRole.entities.Task, [...taskIds]),
    projectIdForAccess
      ? fetchWithRetry(() => base44.asServiceRole.entities.TeamMember.filter({ is_achtung_kraft_member: true }))
      : Promise.resolve([]),
  ]);

  // Fold AK team member user_ids into internalUserIds BEFORE the User fetch
  // so we make ONE combined User query instead of two sequential rounds.
  for (const tm of teamMembers) {
    if (tm.user_id) internalUserIds.add(tm.user_id);
  }

  // Single User fetch with ALL needed IDs (request authors + AK members)
  const users = await fetchByIdsBatched(base44.asServiceRole.entities.User, [...internalUserIds]);

  metrics.entityReads += 4; // contacts, tasks, teamMembers, users
  timings.batch2 = Date.now() - tBatch2;

  // ── STEP 6: Build lookup maps (once) ───────────────────────────────
  const userMap = new Map(users.map(u => [u.id, { id: u.id, full_name: u.full_name, email: u.email }]));
  const contactMap = new Map(clientContacts.map(c => [c.id, { id: c.id, name: c.name, url_slug: c.url_slug, active: c.active }]));

  // ── STEP 7: Sort and enrich (no more entity fetches past this point)
  const tEnrich = Date.now();

  const sortedComments = commentsRaw.slice().sort((a, b) =>
    new Date(b.posted_at || b.created_date) - new Date(a.posted_at || a.created_date)
  );
  const sortedDecisions = decisionsRaw.slice().sort((a, b) =>
    new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date)
  );
  const sortedAttachments = attachmentsRaw.slice().sort((a, b) =>
    new Date(b.posted_at || b.created_date) - new Date(a.posted_at || a.created_date)
  );

  // Enrich request
  const enrichedRequest = {
    ...request,
    creator: request.created_by_user_id ? userMap.get(request.created_by_user_id) : null,
  };

  // Normalized comments — uses pre-indexed attachmentsByCommentId
  const enrichedComments = sortedComments.map(c => {
    const author = c.author_type === 'internal_user' ? userMap.get(c.author_id) : contactMap.get(c.author_id);
    return normalizeComment(
      { ...c, author, author_display_name: author?.full_name || author?.name || 'System' },
      attachmentsByCommentId
    );
  });

  // Trimmed + enriched decisions
  const enrichedDecisions = sortedDecisions.map(d => {
    const trimmed = trimDecision(d);
    const decider = d.decided_by_type === 'internal_user' ? userMap.get(d.decided_by_id) : contactMap.get(d.decided_by_id);

    let decider_display_name = null;
    if (d.decided_by_type === 'client_contact' && contactMap.get(d.decided_by_id)) {
      decider_display_name = contactMap.get(d.decided_by_id).name;
    } else if (d.decided_by_type === 'internal_user' && userMap.get(d.decided_by_id)) {
      decider_display_name = userMap.get(d.decided_by_id).full_name;
    } else if (d.decided_by_type === 'client_contact') {
      decider_display_name = 'Client';
    }
    if (!decider_display_name) decider_display_name = 'System';

    trimmed.decider = decider || null;
    trimmed.decider_display_name = decider_display_name;
    return trimmed;
  });

  // Trimmed + enriched attachments
  const enrichedAttachments = sortedAttachments.map(a => {
    const trimmed = trimAttachment(a);
    trimmed.creator = a.created_by_type === 'internal_user' ? userMap.get(a.created_by_id) : contactMap.get(a.created_by_id);
    return trimmed;
  });

  // Trimmed linked tasks
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const linkedTaskDetails = linkedTasks
    .map(link => {
      const task = taskMap.get(link.task_id);
      return task ? { ...link, task: trimTask(task) } : null;
    })
    .filter(Boolean);

  // Trimmed todo tasks
  const enrichedTodoTasks = todoTasksRaw.map(t => {
    const trimmed = trimTodoTask(t);
    trimmed.assignee = t.assigned_to_type === 'internal_user' ? userMap.get(t.assigned_to_id) : contactMap.get(t.assigned_to_id);
    return trimmed;
  });

  // Task groups
  const taskGroups = taskGroupsRaw.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Project clients
  const projectClientContactIds = new Set(activeAccesses.map(pa => pa.client_contact_id));
  const projectClients = clientContacts.filter(c => projectClientContactIds.has(c.id) && c.active !== false);

  // Build deduplicated client access options with slug, name, contactId
  const slugSeen = new Set();
  const clientAccessOptions = [];
  let primaryClientSlug = null;
  for (const access of activeAccesses) {
    const contact = contactMap.get(access.client_contact_id);
    const slug = contact?.url_slug || access.url_slug || null;
    if (!slug) continue;
    const normalizedSlug = slug.toLowerCase().trim();
    if (slugSeen.has(normalizedSlug)) continue;
    slugSeen.add(normalizedSlug);
    if (!primaryClientSlug) primaryClientSlug = slug;
    clientAccessOptions.push({
      slug,
      name: contact?.name || 'Unknown',
      contactId: access.client_contact_id,
    });
  }

  // Assignable users from team members
  const assignableUsers = teamMembers
    .filter(tm => tm.user_id)
    .map(tm => {
      const userRecord = userMap.get(tm.user_id);
      return userRecord ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } : null;
    })
    .filter(Boolean);

  const assignableContacts = projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }));

  timings.enrich = Date.now() - tEnrich;
  timings.total = Date.now() - t0;

  // Trim project to only fields the frontend uses
  const project = projectArr[0];
  const trimmedProject = project ? { id: project.id, name: project.name } : null;

  const result = {
    success: true,
    request: enrichedRequest,
    comments: enrichedComments,
    decisions: enrichedDecisions,
    attachments: enrichedAttachments,
    todoTasks: enrichedTodoTasks,
    taskGroups,
    linkedTasks: linkedTaskDetails,
    project: trimmedProject,
    users: [...userMap.values()],
    clientContacts: [...contactMap.values()],
    assignableUsers,
    assignableContacts,
    primaryClientSlug,
    clientAccessOptions,
    _debug: {
      executionTimeMs: timings.total,
      timings,
      entityReads: metrics.entityReads,
      counts: {
        comments: commentsRaw.length,
        decisions: decisionsRaw.length,
        attachments: attachmentsRaw.length,
        todoTasks: todoTasksRaw.length,
        linkedTasks: linkedTaskDetails.length,
        users: users.length,
        contacts: clientContacts.length,
        teamMembers: teamMembers.length,
      },
    },
  };

  return result;
}

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

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    let requestId, projectId, bustCache = false;

    try {
      const contentType = req.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const body = await req.json();
        requestId = body.requestId;
        projectId = body.projectId;
        bustCache = !!body.bustCache;
      }
    } catch (e) {
      const url = new URL(req.url);
      requestId = url.searchParams.get('requestId');
      projectId = url.searchParams.get('projectId');
    }

    if (!requestId) {
      return Response.json({ error: 'Missing requestId' }, {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // ── Response cache check (30s TTL) ───────────────────────────────
    const cacheKey = `feedbackDetail:${requestId}`;
    if (bustCache) {
      responseCache.delete(cacheKey);
      inflightRequests.delete(cacheKey);
    }
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`[getInternalFeedbackDetail] CACHE HIT for ${requestId}`);
      return Response.json(cached, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // ── Inflight request coalescing ──────────────────────────────────
    // If another request for this same requestId is already being
    // processed, piggyback on its result instead of running again.
    let resultPromise = inflightRequests.get(cacheKey);
    if (!resultPromise) {
      resultPromise = processRequest(base44, requestId, projectId)
        .finally(() => inflightRequests.delete(cacheKey));
      inflightRequests.set(cacheKey, resultPromise);
    } else {
      console.log(`[getInternalFeedbackDetail] COALESCED request for ${requestId}`);
    }

    const result = await resultPromise;

    // Handle error responses from processRequest
    if (result._status) {
      return Response.json(result, {
        status: result._status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Cache successful result
    setCache(cacheKey, result);

    console.log(`[getInternalFeedbackDetail] ${result._debug.executionTimeMs}ms | reads:${result._debug.entityReads} | comments:${result._debug.counts.comments} attachments:${result._debug.counts.attachments} | timings: req=${result._debug.timings.requestFetch}ms batch1=${result._debug.timings.batch1}ms batch2=${result._debug.timings.batch2}ms enrich=${result._debug.timings.enrich}ms`);

    return Response.json(result, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    const msg = error?.message || '';
    const isRateLimit = error?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests');
    const errorType = isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN';

    console.error('[getInternalFeedbackDetail] Error:', { type: errorType, message: msg });

    return Response.json({
      success: false,
      data: null,
      error: { type: errorType, message: isRateLimit ? 'Rate limit exceeded after retries' : msg },
    }, {
      status: isRateLimit ? 429 : 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
});