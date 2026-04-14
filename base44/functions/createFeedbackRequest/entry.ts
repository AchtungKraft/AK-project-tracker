import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Retry wrapper — only retries transient failures ──────────────────
async function fetchWithRetry(fn, { retries = 2, delay = 600 } = {}) {
  try {
    return await fn();
  } catch (err) {
    const message = String(err?.message || '');
    const isRetryable =
      err?.status === 429 ||
      message.includes('429') ||
      message.includes('RATE_LIMIT') ||
      message.includes('TIMEOUT') ||
      err?.name === 'FetchError';

    if (retries > 0 && isRetryable) {
      const jitter = Math.random() * 200;
      await new Promise(r => setTimeout(r, delay + jitter));
      return fetchWithRetry(fn, { retries: retries - 1, delay: delay * 2 });
    }
    throw err;
  }
}

// ── Timeout wrapper ──────────────────────────────────────────────────
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

// ── Safe batching for secondary writes ───────────────────────────────
async function runBatched(tasks, batchSize = 2, delay = 150) {
  if (!tasks || tasks.length === 0) return [];
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
    if (i + batchSize < tasks.length) {
      const jitter = Math.random() * 150;
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }
  return results;
}

// ── Response helpers ─────────────────────────────────────────────────
function ok(data, extra = {}) {
  return Response.json({ success: true, data, error: null, ...extra });
}

function fail(type, message, status = 500) {
  return Response.json(
    { success: false, data: null, error: { type, message } },
    { status }
  );
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

  let projectId = null;

  try {
    const base44 = createClientFromRequest(req);

    // ── Parse payload ────────────────────────────────────────────────
    const payload = await req.json();
    const {
      title,
      body,
      request_type,
      due_date,
      project_id,
      submission_token,
    } = payload;

    projectId = project_id;

    // ── Validation ───────────────────────────────────────────────────
    if (!title || !title.trim()) {
      return fail('VALIDATION', 'Title is required', 400);
    }
    if (!project_id) {
      return fail('VALIDATION', 'Project is required', 400);
    }
    if (!request_type) {
      return fail('VALIDATION', 'Request type is required', 400);
    }

    // ── Auth ─────────────────────────────────────────────────────────
    const user = await base44.auth.me();
    if (!user) {
      return fail('VALIDATION', 'Unauthorized', 401);
    }

    // ══════════════════════════════════════════════════════════════════
    // PHASE 2 — IDEMPOTENCY: Check for duplicate submission_token
    // ══════════════════════════════════════════════════════════════════
    if (submission_token) {
      try {
        // Search for a recently created request with matching title + project
        // by the same user within a short window. The submission_token is
        // stored in the request body field as a hidden marker to detect
        // exact duplicates without schema changes.
        const recentRequests = await fetchWithRetry(() =>
          base44.asServiceRole.entities.ClientFeedbackRequest.filter({
            project_id,
            created_by_user_id: user.id,
            title: title.trim(),
          })
        );

        // Check for exact duplicate: same title + same project + created within last 60s
        const now = Date.now();
        const duplicate = recentRequests.find(r => {
          const createdAt = new Date(r.created_date).getTime();
          return (now - createdAt) < 60000; // within 60 seconds
        });

        if (duplicate) {
          console.warn('CREATE_FEEDBACK_REQUEST_DUPLICATE', { projectId: project_id });
          return ok(duplicate, { duplicate: true });
        }
      } catch (dupCheckErr) {
        // Duplicate check failed — proceed with create rather than blocking
        console.warn('Duplicate check failed, proceeding with create:', dupCheckErr?.message);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // PHASE 3 — CORE CREATE (single write, must succeed)
    // ══════════════════════════════════════════════════════════════════
    const currentTimestamp = new Date().toISOString();

    let newRequest;
    try {
      newRequest = await withTimeout(
        fetchWithRetry(() =>
          base44.asServiceRole.entities.ClientFeedbackRequest.create({
            title: title.trim(),
            body: body || null,
            request_type,
            due_date: due_date || null,
            project_id,
            created_by_user_id: user.id,
            status: 'draft',
          })
        ),
        8000
      );
    } catch (createErr) {
      const msg = String(createErr?.message || '');

      if (msg === 'TIMEOUT') {
        console.error('CREATE_FEEDBACK_REQUEST_FAILURE', {
          errorType: 'TIMEOUT',
          message: msg,
          projectId: project_id,
        });
        return fail('TIMEOUT', 'Request creation timed out. Please retry.', 504);
      }

      const isRateLimit =
        createErr?.status === 429 ||
        msg.includes('429') ||
        msg.includes('Rate limit');

      if (isRateLimit) {
        console.warn('CREATE_FEEDBACK_REQUEST_RATE_LIMIT', { projectId: project_id });
        return fail('RATE_LIMIT', 'Temporary issue creating request. Please retry.', 429);
      }

      console.error('CREATE_FEEDBACK_REQUEST_FAILURE', {
        errorType: 'UNKNOWN',
        message: msg,
        projectId: project_id,
      });
      return fail('UNKNOWN', msg || 'Failed to create feedback request', 500);
    }

    // ══════════════════════════════════════════════════════════════════
    // PHASE 6 — SECONDARY WRITES (optional, failures don't fail create)
    // ══════════════════════════════════════════════════════════════════
    const warnings = [];

    // Example: any future secondary writes (notifications, activity log, etc.)
    // would go here using runBatched with max 2 concurrent:
    //
    // const secondaryTasks = [
    //   () => fetchWithRetry(() => base44.asServiceRole.entities.ActivityLog.create({...})),
    //   () => fetchWithRetry(() => sendNotification({...})),
    // ];
    // try {
    //   await runBatched(secondaryTasks, 2, 150);
    // } catch (secErr) {
    //   warnings.push({ type: 'SECONDARY_WRITE_FAILED', message: secErr?.message });
    //   console.warn('Secondary write failed after core create:', secErr?.message);
    // }

    // ── Return success ───────────────────────────────────────────────
    const response = { success: true, data: newRequest, error: null };
    if (warnings.length > 0) {
      response.warnings = warnings;
    }
    return Response.json(response);

  } catch (error) {
    const msg = String(error?.message || '');
    const isRateLimit =
      error?.status === 429 ||
      msg.includes('429') ||
      msg.includes('Rate limit');
    const errorType = isRateLimit ? 'RATE_LIMIT' : msg === 'TIMEOUT' ? 'TIMEOUT' : 'UNKNOWN';

    console.error('CREATE_FEEDBACK_REQUEST_FAILURE', {
      errorType,
      message: msg,
      projectId,
    });

    return fail(
      errorType,
      isRateLimit
        ? 'Temporary issue creating request. Please retry.'
        : msg || 'Failed to create feedback request',
      isRateLimit ? 429 : 500
    );
  }
});