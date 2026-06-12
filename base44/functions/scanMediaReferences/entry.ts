import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Scans all supported entities for exact URL matches of a given image URL.
 * Supports two modes:
 *   - scan: returns preview of all references found
 *   - migrate: replaces old URL with new URL in all matching records, creates migration record
 */

const SCAN_CONFIG = [
  // Entity name, array fields (url arrays), string fields (exact url), text fields (url embedded in html/text)
  { entity: 'Project',         arrayFields: ['images'], stringFields: ['featured_image_url'], textFields: [] },
  { entity: 'Part',            arrayFields: ['photos'], stringFields: ['featured_photo'], textFields: ['notes'] },
  { entity: 'Comment',         arrayFields: ['images'], stringFields: [], textFields: ['content'] },
  { entity: 'TaskComment',     arrayFields: ['photos'], stringFields: [], textFields: ['content'] },
  { entity: 'JournalEntry',    arrayFields: ['photos'], stringFields: [], textFields: ['content', 'content_html'] },
  { entity: 'ClientFeedbackAttachment', arrayFields: [], stringFields: ['file_url'], textFields: [] },
  { entity: 'ClientFeedbackComment',    arrayFields: ['photos'], stringFields: [], textFields: ['body', 'content_html', 'content_fallback'] },
  { entity: 'ClientFeedbackRequest',    arrayFields: [], stringFields: [], textFields: ['body'] },
  { entity: 'BuildKnowledgeItem',       arrayFields: ['image_urls', 'media_urls'], stringFields: ['cover_image_url'], textFields: ['content_html', 'summary'] },
  { entity: 'BuildKnowledgeProjectNote', arrayFields: ['photos'], stringFields: [], textFields: ['note'] },
  { entity: 'ProcedureEntry',  arrayFields: ['image_urls'], stringFields: [], textFields: ['content_html'] },
  { entity: 'EmailTemplate',   arrayFields: [], stringFields: [], textFields: ['body_intro', 'closing_text'] },
  { entity: 'Task',            arrayFields: [], stringFields: [], textFields: ['description'] },
];

// Human-readable name for a record
function getRecordName(entity, record) {
  return record.name || record.title || record.headline || record.file_name || record.template_name || record.part_name || record.pool_name || `${entity} #${record.id?.slice(-6)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const { mode, old_url, new_url, old_asset_id, new_asset_id } = await req.json();

    if (!old_url || !old_url.trim()) {
      return Response.json({ error: 'old_url is required' }, { status: 400 });
    }

    const targetUrl = old_url.trim();
    const replacementUrl = new_url?.trim() || '';

    // Scan all entities
    const allMatches = [];

    for (const config of SCAN_CONFIG) {
      let records;
      try {
        records = await base44.asServiceRole.entities[config.entity].list('-created_date', 500);
      } catch (e) {
        console.warn(`Skipping ${config.entity}: ${e.message}`);
        continue;
      }

      for (const record of records) {
        // Check array fields (exact element match)
        for (const field of config.arrayFields) {
          const val = record[field];
          if (!Array.isArray(val)) continue;
          const matchingIndices = [];
          val.forEach((v, i) => { if (typeof v === 'string' && v === targetUrl) matchingIndices.push(i); });
          if (matchingIndices.length > 0) {
            allMatches.push({
              entity: config.entity,
              record_id: record.id,
              record_name: getRecordName(config.entity, record),
              field,
              match_type: 'array_element',
              match_count: matchingIndices.length,
              before_value: `[...${val.length} items, ${matchingIndices.length} match(es)]`,
              after_value: replacementUrl ? `[...${val.length} items, replaced]` : null,
            });
          }
        }

        // Check string fields (exact match)
        for (const field of config.stringFields) {
          const val = record[field];
          if (typeof val === 'string' && val === targetUrl) {
            allMatches.push({
              entity: config.entity,
              record_id: record.id,
              record_name: getRecordName(config.entity, record),
              field,
              match_type: 'exact_string',
              match_count: 1,
              before_value: targetUrl,
              after_value: replacementUrl || null,
            });
          }
        }

        // Check text fields (url embedded in text/html content)
        for (const field of config.textFields) {
          const val = record[field];
          if (typeof val !== 'string') continue;
          // Count occurrences
          let count = 0;
          let idx = 0;
          while ((idx = val.indexOf(targetUrl, idx)) !== -1) { count++; idx += targetUrl.length; }
          if (count > 0) {
            // Get a snippet around first occurrence
            const firstIdx = val.indexOf(targetUrl);
            const snippetStart = Math.max(0, firstIdx - 40);
            const snippetEnd = Math.min(val.length, firstIdx + targetUrl.length + 40);
            const snippet = (snippetStart > 0 ? '...' : '') + val.slice(snippetStart, snippetEnd) + (snippetEnd < val.length ? '...' : '');
            
            allMatches.push({
              entity: config.entity,
              record_id: record.id,
              record_name: getRecordName(config.entity, record),
              field,
              match_type: 'text_contains',
              match_count: count,
              before_value: snippet,
              after_value: replacementUrl ? snippet.split(targetUrl).join(replacementUrl) : null,
            });
          }
        }
      }
    }

    // SCAN mode — just return preview
    if (mode === 'scan') {
      return Response.json({
        status: 'ok',
        total_references: allMatches.reduce((sum, m) => sum + m.match_count, 0),
        total_records: allMatches.length,
        matches: allMatches,
      });
    }

    // MIGRATE mode — execute replacements
    if (mode === 'migrate') {
      if (!replacementUrl) {
        return Response.json({ error: 'new_url is required for migration' }, { status: 400 });
      }

      let successCount = 0;
      let failCount = 0;
      const details = [];

      for (const match of allMatches) {
        try {
          // Re-fetch fresh record to avoid stale data
          const freshRecords = await base44.asServiceRole.entities[match.entity].filter({ id: match.record_id });
          const record = freshRecords[0];
          if (!record) { failCount++; continue; }

          const currentValue = record[match.field];
          let updatedValue;

          if (match.match_type === 'array_element' && Array.isArray(currentValue)) {
            updatedValue = currentValue.map(v => v === targetUrl ? replacementUrl : v);
          } else if (match.match_type === 'exact_string' && typeof currentValue === 'string') {
            updatedValue = currentValue === targetUrl ? replacementUrl : currentValue;
          } else if (match.match_type === 'text_contains' && typeof currentValue === 'string') {
            updatedValue = currentValue.split(targetUrl).join(replacementUrl);
          } else {
            failCount++;
            continue;
          }

          await base44.asServiceRole.entities[match.entity].update(match.record_id, { [match.field]: updatedValue });
          successCount++;
          details.push({
            entity: match.entity,
            record_id: match.record_id,
            record_name: match.record_name,
            field: match.field,
            match_type: match.match_type,
          });
        } catch (e) {
          console.warn(`Migration failed for ${match.entity} ${match.record_id}.${match.field}: ${e.message}`);
          failCount++;
        }
      }

      // Mark old asset as superseded
      if (old_asset_id) {
        try {
          await base44.asServiceRole.entities.MediaAsset.update(old_asset_id, {
            status: 'superseded',
            superseded_by_url: replacementUrl,
            superseded_by_asset_id: new_asset_id || null,
            superseded_at: new Date().toISOString(),
            superseded_by_user: user.id,
            replacement_note: `Replaced via migration. ${successCount} references updated across ${details.length} records.`,
          });
        } catch (e) {
          console.warn(`Failed to supersede old asset: ${e.message}`);
        }
      }

      // Create migration audit record
      let migrationId = null;
      try {
        const migration = await base44.asServiceRole.entities.MediaAssetMigration.create({
          old_asset_id: old_asset_id || null,
          new_asset_id: new_asset_id || null,
          old_url: targetUrl,
          new_url: replacementUrl,
          references_found: allMatches.reduce((sum, m) => sum + m.match_count, 0),
          records_modified: successCount,
          migration_details: details,
          status: failCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed'),
          executed_by: user.id,
          executed_at: new Date().toISOString(),
        });
        migrationId = migration.id;
      } catch (e) {
        console.warn(`Failed to create migration record: ${e.message}`);
      }

      return Response.json({
        status: 'ok',
        references_found: allMatches.reduce((sum, m) => sum + m.match_count, 0),
        records_modified: successCount,
        records_failed: failCount,
        migration_id: migrationId,
        old_asset_superseded: !!old_asset_id,
        details,
      });
    }

    return Response.json({ error: 'Invalid mode. Use "scan" or "migrate".' }, { status: 400 });
  } catch (error) {
    console.error('scanMediaReferences error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});