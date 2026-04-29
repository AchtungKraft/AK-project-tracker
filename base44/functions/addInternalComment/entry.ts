import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// Phase 5: Already writes content_html, content_fallback, links[], photos[], files[]
// with backward compatibility for body-only payloads

// ── Link metadata enrichment ─────────────────────────────────────────
// Fetches OG/meta tags from a URL to populate title + description.
// Non-fatal: returns partial data on failure so links always save.
async function enrichLinkMeta(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return {};
    const html = await resp.text();
    // Only parse the first 50KB to keep it fast
    const head = html.slice(0, 50000);

    const og = (prop) => {
      const m = head.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
             || head.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
      return m?.[1]?.trim() || null;
    };
    const meta = (name) => {
      const m = head.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
             || head.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'));
      return m?.[1]?.trim() || null;
    };
    const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);

    return {
      title: og('title') || meta('title') || titleMatch?.[1]?.trim() || null,
      description: og('description') || meta('description') || null,
      image: og('image') || null,
    };
  } catch {
    return {};
  }
}

async function enrichLinks(links) {
  if (!links || links.length === 0) return links;
  return Promise.all(links.map(async (link) => {
    // Skip enrichment if link already has a non-empty description
    if (link.description && link.description.trim()) return link;
    const meta = await enrichLinkMeta(link.url);
    return {
      ...link,
      name: link.name || meta.title || link.url,
      description: meta.description || link.description || null,
    };
  }));
}

// ── Retry wrapper for transient failures (429, network) ──────────────
async function fetchWithRetry(fn, { retries = 2, delay = 600 } = {}) {
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
      const jitter = Math.random() * 200;
      await new Promise(r => setTimeout(r, delay + jitter));
      return fetchWithRetry(fn, { retries: retries - 1, delay: delay * 2 });
    }
    throw err;
  }
}

// ── Safe batching for secondary writes (max 2 concurrent) ────────────
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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        const {
            requestId,
            // New rich content fields
            content_html,
            content_fallback,
            links,
            // Legacy field — still accepted for backward compatibility
            body,
            visibility,
            photos,
            files,
        } = payload;

        if (!requestId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const currentTimestamp = new Date().toISOString();

        // Build comment record — support both new and legacy payloads
        const commentData = {
            request_id: requestId,
            author_type: 'internal_user',
            author_id: user.id,
            visibility: visibility || 'client_visible',
            target_type: 'request',
            posted_at: currentTimestamp,
        };

        // Rich content fields (preferred)
        if (content_html) {
            commentData.content_html = content_html;
            commentData.content_fallback = content_fallback || '';
            // Also populate legacy body field for backward compat
            commentData.body = content_fallback || '';
        } else if (body) {
            // Legacy plain text path
            commentData.body = body;
            commentData.content_fallback = body;
        }

        // Structured links stored directly on comment — enrich missing descriptions
        if (links && Array.isArray(links) && links.length > 0) {
            const validLinks = links.filter(l => l && l.url && l.url.trim());
            commentData.links = await enrichLinks(validLinks);
        }

        // Photos and files stored directly on comment
        if (photos && Array.isArray(photos) && photos.length > 0) {
            commentData.photos = photos;
        }
        if (files && Array.isArray(files) && files.length > 0) {
            commentData.files = files;
        }

        const comment = await fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackComment.create(commentData));

        // ── SECONDARY WRITES: Attachment records (non-fatal) ─────────────
        // Core comment already saved above. Attachment failures are warnings,
        // not errors — the comment is already persisted.
        const attachments = [];
        const warnings = [];

        const attachmentTasks = [];

        if (photos && photos.length > 0) {
            for (const photoUrl of photos) {
                attachmentTasks.push(() => fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                    request_id: requestId,
                    comment_id: comment.id,
                    attachment_type: 'image',
                    file_url: photoUrl,
                    created_by_type: 'internal_user',
                    created_by_id: user.id,
                    posted_at: currentTimestamp
                })));
            }
        }

        if (files && files.length > 0) {
            for (const file of files) {
                attachmentTasks.push(() => fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                    request_id: requestId,
                    comment_id: comment.id,
                    attachment_type: 'file',
                    file_url: file.url,
                    label: file.name,
                    created_by_type: 'internal_user',
                    created_by_id: user.id,
                    posted_at: currentTimestamp
                })));
            }
        }

        if (links && Array.isArray(links) && links.length > 0) {
            for (const link of links) {
                if (link && link.url && link.url.trim()) {
                    attachmentTasks.push(() => fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                        request_id: requestId,
                        comment_id: comment.id,
                        attachment_type: 'link',
                        link_url: link.url.trim(),
                        label: link.name || link.url.trim(),
                        created_by_type: 'internal_user',
                        created_by_id: user.id,
                        posted_at: currentTimestamp
                    })));
                }
            }
        }

        // Run attachment writes in batches of 2 — non-fatal
        if (attachmentTasks.length > 0) {
            try {
                const results = await runBatched(attachmentTasks, 2, 150);
                attachments.push(...results);
            } catch (attErr) {
                console.warn('ATTACHMENT_WRITE_PARTIAL_FAILURE', { commentId: comment.id, error: attErr?.message });
                warnings.push({ type: 'ATTACHMENT_WRITE_FAILED', message: attErr?.message });
            }
        }

        // AUTO-REOPEN IF ARCHIVED (non-fatal)
        try {
            const requests = await fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId }));
            const request = requests[0];
            if (request && request.status === 'archived') {
                await fetchWithRetry(() => base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, {
                    status: 'posted',
                    archived_at: null
                }));
            }
        } catch (reopenErr) {
            console.warn('AUTO_REOPEN_FAILED', { requestId, error: reopenErr?.message });
            warnings.push({ type: 'AUTO_REOPEN_FAILED', message: reopenErr?.message });
        }

        const response = { success: true, comment, attachments };
        if (warnings.length > 0) response.warnings = warnings;
        return Response.json(response);

    } catch (error) {
        const msg = error?.message || '';
        const isRateLimit = error?.status === 429 || msg.includes('429') || msg.includes('Too Many Requests');
        const errorType = isRateLimit ? 'RATE_LIMIT' : 'UNKNOWN';

        console.error("Feedback API Error:", { type: errorType, message: msg, fn: 'addInternalComment' });

        return Response.json({ 
            success: false,
            error: { type: errorType, message: isRateLimit ? 'Rate limit exceeded after retries' : msg }
        }, { status: isRateLimit ? 429 : 500 });
    }
});