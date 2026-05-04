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

    if (page.status !== 'published') {
      return Response.json({ success: false, error: 'Page not published' }, { status: 404 });
    }

    // Load blocks
    const blocks = await base44.asServiceRole.entities.PageBlock.filter({ page_id: page.id });
    blocks.sort((a, b) => (a.order || 0) - (b.order || 0));

    // --- Batch-load shared blocks ---
    const sharedBlockIds = blocks
      .filter(b => b.source_type === 'shared' && b.shared_block_id)
      .map(b => b.shared_block_id);

    const sharedBlocksMap = {};
    if (sharedBlockIds.length > 0) {
      const sharedBlocks = await base44.asServiceRole.entities.SharedBlock.filter({
        id: { $in: sharedBlockIds }
      });
      sharedBlocks.forEach(sb => { sharedBlocksMap[sb.id] = sb; });
    }

    // --- Resolve block data server-side ---
    const allAssetIds = new Set();

    const resolvedBlocks = blocks.map(block => {
      let resolved_data;
      if (block.source_type === 'shared' && block.shared_block_id) {
        const shared = sharedBlocksMap[block.shared_block_id];
        if (shared) {
          resolved_data = shared.data || {};
        } else {
          resolved_data = { _error: 'missing_shared_block' };
        }
      } else {
        resolved_data = block.data || {};
      }

      // Collect asset_ids for batch resolution
      if (resolved_data.asset_ids) {
        resolved_data.asset_ids.forEach(id => allAssetIds.add(id));
      }

      return {
        id: block.id,
        type: block.type,
        order: block.order,
        source_type: block.source_type,
        resolved_data,
      };
    });

    // --- Batch-load media assets ---
    const mediaAssetsMap = {};
    if (allAssetIds.size > 0) {
      const mediaAssets = await base44.asServiceRole.entities.MediaAsset.filter({
        id: { $in: [...allAssetIds] }
      });
      mediaAssets.forEach(m => { mediaAssetsMap[m.id] = m; });
    }

    // --- Attach resolved assets to blocks that need them ---
    for (const block of resolvedBlocks) {
      const data = block.resolved_data;
      if (data?.asset_ids && data.asset_ids.length > 0) {
        block.resolved_assets = data.asset_ids
          .map(id => mediaAssetsMap[id])
          .filter(Boolean)
          .map(a => ({ id: a.id, file_url: a.file_url, type: a.type, title: a.title }));
      }
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

    console.log(`[publicClientPage] slug=${slug} page=${page_slug} blocks=${resolvedBlocks.length}`);

    return Response.json({
      success: true,
      page,
      blocks: resolvedBlocks,
      project: project ? { id: project.id, name: project.name } : null,
      contact: { id: contact.id, name: contact.name }
    });
  } catch (error) {
    console.error('[publicClientPage] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});