import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { slug, page_slug } = await req.json();

    if (!slug || !page_slug) {
      return Response.json({ success: false, error: 'Missing slug or page_slug' }, { status: 400 });
    }

    // Find client contact by slug
    const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug });
    if (!contacts.length) {
      return Response.json({ success: false, error: 'Client not found' }, { status: 404 });
    }
    const contact = contacts[0];

    // Find the page
    const pages = await base44.asServiceRole.entities.ClientPage.filter({
      client_contact_id: contact.id,
      page_slug: page_slug
    });

    if (!pages.length) {
      return Response.json({ success: false, error: 'Page not found' }, { status: 404 });
    }

    const page = pages[0];

    // Check status
    if (page.status !== 'published') {
      return Response.json({ success: false, error: 'Page not published' }, { status: 404 });
    }

    // Load blocks
    const blocks = await base44.asServiceRole.entities.PageBlock.filter({ page_id: page.id });
    blocks.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Load shared blocks if any
    const sharedBlockIds = blocks
      .filter(b => b.source_type === 'shared' && b.shared_block_id)
      .map(b => b.shared_block_id);

    let sharedBlocks = [];
    if (sharedBlockIds.length > 0) {
      const allShared = await base44.asServiceRole.entities.SharedBlock.list();
      sharedBlocks = allShared.filter(sb => sharedBlockIds.includes(sb.id));
    }

    // Load media assets referenced in block data
    const allAssetIds = new Set();
    const resolveAssetIds = (data) => {
      if (!data) return;
      if (data.asset_ids) data.asset_ids.forEach(id => allAssetIds.add(id));
    };

    blocks.forEach(b => {
      if (b.source_type === 'inline') resolveAssetIds(b.data);
    });
    sharedBlocks.forEach(sb => resolveAssetIds(sb.data));

    let mediaAssets = [];
    if (allAssetIds.size > 0) {
      const allMedia = await base44.asServiceRole.entities.MediaAsset.list();
      mediaAssets = allMedia.filter(m => allAssetIds.has(m.id));
    }

    // Get project info
    let project = null;
    if (page.project_id) {
      const projects = await base44.asServiceRole.entities.Project.filter({ id: page.project_id });
      project = projects[0] || null;
    }

    // Track view (fire-and-forget)
    base44.asServiceRole.entities.PageAnalytics.create({
      page_id: page.id,
      client_contact_id: contact.id,
      client_slug: slug,
      page_slug: page_slug,
      event_type: 'view'
    }).catch(() => {});

    return Response.json({
      success: true,
      page,
      blocks,
      sharedBlocks,
      mediaAssets,
      project: project ? { id: project.id, name: project.name } : null,
      contact: { id: contact.id, name: contact.name }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});