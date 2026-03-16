import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getClientJournalEntries - Client Portal Journal API
 * 
 * Returns normalized journal entries for client-visible content.
 * 
 * Normalization rules:
 * - content_html: sanitized rich HTML if present, null otherwise
 * - content_fallback: original plain text content
 * - links: always array, never null. Legacy url normalized into links[].
 * - photos: always array
 * - attachments: always array
 * 
 * HTML sanitization is done server-side to prevent XSS in the client portal.
 */

// Minimal server-side HTML sanitizer (no DOM available in Deno)
// Strips script tags, event handlers, and dangerous attributes
function sanitizeHtmlServer(html) {
  if (!html || typeof html !== 'string') return '';
  
  let clean = html;
  
  // Remove script tags and content
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove style tags and content
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove iframe tags
  clean = clean.replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, '');
  clean = clean.replace(/<iframe\b[^>]*\/>/gi, '');
  
  // Remove event handlers (on*)
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  
  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  clean = clean.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
  clean = clean.replace(/src\s*=\s*"javascript:[^"]*"/gi, '');
  clean = clean.replace(/src\s*=\s*'javascript:[^']*'/gi, '');
  
  // Remove data:text URIs (potential XSS vector)
  clean = clean.replace(/src\s*=\s*"data:text[^"]*"/gi, '');
  clean = clean.replace(/src\s*=\s*'data:text[^']*'/gi, '');
  
  // Remove style attributes (prevent CSS injection)
  clean = clean.replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  
  return clean;
}

function normalizeEntry(entry) {
  const normalized = {
    id: entry.id,
    headline: entry.headline || null,
    entry_date: entry.entry_date || entry.created_date,
    created_date: entry.created_date,
    updated_date: entry.updated_date,
    visibility: entry.visibility || 'internal',
  };
  
  // Content: prefer content_html, fallback to content
  if (entry.content_html) {
    normalized.content_html = sanitizeHtmlServer(entry.content_html);
  } else {
    normalized.content_html = null;
  }
  normalized.content = entry.content || '';
  normalized.content_fallback = entry.content || '';
  
  // Photos: always array
  normalized.photos = Array.isArray(entry.photos) ? entry.photos : [];
  
  // Attachments: always array
  normalized.attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
  
  // Links: always array, normalize legacy url
  if (Array.isArray(entry.links) && entry.links.length > 0) {
    normalized.links = entry.links;
  } else if (entry.url && typeof entry.url === 'string' && entry.url.trim()) {
    normalized.links = [{
      id: 'legacy-url',
      name: 'External Link',
      description: '',
      url: entry.url,
      type: 'external',
    }];
  } else {
    normalized.links = [];
  }
  
  return normalized;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    
    let projectId, token, slug;
    try {
      const body = await req.json();
      projectId = body.projectId;
      token = body.token;
      slug = body.slug;
    } catch {
      const url = new URL(req.url);
      projectId = url.searchParams.get('projectId');
      token = url.searchParams.get('token');
      slug = url.searchParams.get('slug');
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Validate client access using token or slug
    let access = null;
    
    if (token && token !== 'null' && token.trim() !== '') {
      const accessRecords = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
        share_token: token,
        access_status: 'active'
      });
      access = accessRecords.find(a => a.project_id === projectId);
    }
    
    if (!access && slug && slug !== 'null' && slug.trim() !== '') {
      const clients = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug });
      if (clients.length > 0) {
        const clientId = clients[0].id;
        const accessRecords = await base44.asServiceRole.entities.ProjectClientAccess.filter({
          client_contact_id: clientId,
          project_id: projectId,
          access_status: 'active'
        });
        access = accessRecords[0];
      }
    }

    if (!access) {
      return Response.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Fetch journal entries with client visibility
    const journalEntries = await base44.asServiceRole.entities.JournalEntry.filter({
      project_id: projectId,
      visibility: 'client'
    });

    // Normalize and sort
    const normalizedEntries = journalEntries
      .map(normalizeEntry)
      .sort((a, b) => 
        new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date)
      );

    return Response.json({
      success: true,
      entries: normalizedEntries,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Error fetching client journal entries:', error);
    return Response.json({ error: error.message }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }
});