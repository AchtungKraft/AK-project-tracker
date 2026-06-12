import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Scans all supported entities for URL matches of a given image URL.
 * Supports two modes:
 *   - scan: returns preview of all references found
 *   - migrate: replaces old URL with new URL in all matching records, creates migration record
 *
 * URL normalization: handles both base44.app and media.base44.com URL variants.
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
  { entity: 'ClientFeedbackDecision',   arrayFields: [], stringFields: ['target_image_url'], textFields: ['note'] },
  { entity: 'BuildKnowledgeItem',       arrayFields: ['image_urls', 'media_urls'], stringFields: ['cover_image_url'], textFields: ['content_html', 'summary'] },
  { entity: 'BuildKnowledgeProjectNote', arrayFields: ['photos'], stringFields: [], textFields: ['note'] },
  { entity: 'ProcedureEntry',  arrayFields: ['image_urls'], stringFields: [], textFields: ['content_html'] },
  { entity: 'EmailTemplate',   arrayFields: [], stringFields: [], textFields: ['body_intro', 'closing_text'] },
  { entity: 'Task',            arrayFields: [], stringFields: [], textFields: ['description'] },
  { entity: 'ToDoListTask',   arrayFields: ['images'], stringFields: [], textFields: ['details'] },
];

// Base44 public file URL patterns — same file can appear under different hostnames
const BASE44_APP_PREFIX = 'https://base44.app/api/apps/';
const BASE44_MEDIA_PREFIX = 'https://media.base44.com/images/public/';

/**
 * Normalize a Base44 file URL to a canonical form for matching.
 * Strips query strings, decodes URL encoding, and extracts the relative path.
 * Returns { canonical, variants } where variants are all known URL forms.
 */
function normalizeBase44Url(url) {
  if (!url || typeof url !== 'string') return null;

  // Strip query string
  let clean = url.split('?')[0];

  // Decode URL encoding
  try { clean = decodeURIComponent(clean); } catch {}

  // Extract relative path from known Base44 patterns
  let relativePath = null;

  // Pattern 1: https://base44.app/api/apps/{appId}/files/mp/public/{relativePath}
  const appMatch = clean.match(/base44\.app\/api\/apps\/[^/]+\/files\/mp\/public\/(.+)$/);
  if (appMatch) relativePath = appMatch[1];

  // Pattern 2: https://media.base44.com/images/public/{relativePath}
  if (!relativePath) {
    const mediaMatch = clean.match(/media\.base44\.com\/images\/public\/(.+)$/);
    if (mediaMatch) relativePath = mediaMatch[1];
  }

  if (relativePath) {
    return { canonical: relativePath, isBase44: true, cleanUrl: clean };
  }

  // Non-Base44 URL — use cleaned URL as canonical
  return { canonical: clean, isBase44: false, cleanUrl: clean };
}

/**
 * Check if candidateUrl matches the targetUrl.
 * targetNorm is the pre-computed normalization of targetUrl (for performance).
 */
function urlsMatch(candidateUrl, targetUrl, targetNorm) {
  if (!candidateUrl || !targetUrl) return false;
  // Fast exact match
  if (candidateUrl === targetUrl) return true;

  // Strip query strings for secondary check
  const cleanCandidate = candidateUrl.split('?')[0];
  const cleanTarget = targetUrl.split('?')[0];
  if (cleanCandidate === cleanTarget) return true;

  // Base44 cross-hostname normalization
  if (!targetNorm) targetNorm = normalizeBase44Url(targetUrl);
  const candidateNorm = normalizeBase44Url(candidateUrl);
  if (targetNorm?.isBase44 && candidateNorm?.isBase44 && targetNorm.canonical === candidateNorm.canonical) return true;

  return false;
}

/**
 * Check if text contains the URL (considering variants).
 */
function findUrlInText(text, targetUrl, targetNorm) {
  if (!text || typeof text !== 'string') return { count: 0, indices: [] };

  const indices = [];
  let count = 0;

  // Direct substring search
  let idx = 0;
  while ((idx = text.indexOf(targetUrl, idx)) !== -1) {
    indices.push(idx);
    count++;
    idx += targetUrl.length;
  }

  // If Base44 URL, also search for alternate hostname variant
  if (targetNorm?.isBase44 && count === 0) {
    // Build alternate URL forms
    const alternates = buildAlternateUrls(targetUrl, targetNorm);
    for (const alt of alternates) {
      idx = 0;
      while ((idx = text.indexOf(alt, idx)) !== -1) {
        indices.push(idx);
        count++;
        idx += alt.length;
      }
    }
  }

  return { count, indices };
}

/**
 * Replace URL in text, handling both exact and alternate forms.
 */
function replaceUrlInText(text, targetUrl, replacementUrl, targetNorm) {
  if (!text || typeof text !== 'string') return text;

  let result = text.split(targetUrl).join(replacementUrl);

  // Also replace alternate forms
  if (targetNorm?.isBase44) {
    const alternates = buildAlternateUrls(targetUrl, targetNorm);
    for (const alt of alternates) {
      result = result.split(alt).join(replacementUrl);
    }
  }

  return result;
}

/**
 * Build alternate Base44 URL forms for a given URL.
 */
function buildAlternateUrls(originalUrl, norm) {
  const alternates = [];
  if (!norm?.isBase44 || !norm.canonical) return alternates;

  const clean = originalUrl.split('?')[0];

  // If original is base44.app form, add media.base44.com form
  if (clean.includes('base44.app/api/apps/')) {
    alternates.push(BASE44_MEDIA_PREFIX + norm.canonical);
  }

  // If original is media.base44.com form, we can't reconstruct the app ID for base44.app form
  // but the scan will still find by relative path matching

  return alternates;
}

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
    const targetNorm = normalizeBase44Url(targetUrl);

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
        // Check array fields (exact element match with normalization)
        for (const field of config.arrayFields) {
          const val = record[field];
          if (!Array.isArray(val)) continue;
          const matchingIndices = [];
          val.forEach((v, i) => {
            if (typeof v === 'string' && urlsMatch(v, targetUrl, targetNorm)) matchingIndices.push(i);
          });
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

        // Check string fields (exact match with normalization)
        for (const field of config.stringFields) {
          const val = record[field];
          if (typeof val === 'string' && urlsMatch(val, targetUrl, targetNorm)) {
            allMatches.push({
              entity: config.entity,
              record_id: record.id,
              record_name: getRecordName(config.entity, record),
              field,
              match_type: 'exact_string',
              match_count: 1,
              before_value: val,
              after_value: replacementUrl || null,
            });
          }
        }

        // Check text fields (url embedded in text/html content, with variant matching)
        for (const field of config.textFields) {
          const val = record[field];
          if (typeof val !== 'string') continue;

          const { count } = findUrlInText(val, targetUrl, targetNorm);
          if (count > 0) {
            // Get a snippet around first occurrence
            const firstIdx = val.indexOf(targetUrl);
            const snippetIdx = firstIdx >= 0 ? firstIdx : val.indexOf(targetUrl.split('?')[0]);
            const actualIdx = snippetIdx >= 0 ? snippetIdx : 0;
            const snippetStart = Math.max(0, actualIdx - 40);
            const snippetEnd = Math.min(val.length, actualIdx + targetUrl.length + 40);
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
      const verificationFailures = [];

      for (const match of allMatches) {
        try {
          // Re-fetch fresh record to avoid stale data
          const freshRecords = await base44.asServiceRole.entities[match.entity].filter({ id: match.record_id });
          const record = freshRecords[0];
          if (!record) {
            failCount++;
            details.push({
              entity: match.entity, record_id: match.record_id, record_name: match.record_name,
              field: match.field, match_type: match.match_type, status: 'failed', error: 'Record not found',
            });
            continue;
          }

          const currentValue = record[match.field];
          let updatedValue;

          if (match.match_type === 'array_element' && Array.isArray(currentValue)) {
            updatedValue = currentValue.map(v =>
              typeof v === 'string' && urlsMatch(v, targetUrl, targetNorm) ? replacementUrl : v
            );
          } else if (match.match_type === 'exact_string' && typeof currentValue === 'string') {
            updatedValue = urlsMatch(currentValue, targetUrl, targetNorm) ? replacementUrl : currentValue;
          } else if (match.match_type === 'text_contains' && typeof currentValue === 'string') {
            updatedValue = replaceUrlInText(currentValue, targetUrl, replacementUrl, targetNorm);
          } else {
            failCount++;
            details.push({
              entity: match.entity, record_id: match.record_id, record_name: match.record_name,
              field: match.field, match_type: match.match_type, status: 'failed', error: 'Type mismatch',
            });
            continue;
          }

          await base44.asServiceRole.entities[match.entity].update(match.record_id, { [match.field]: updatedValue });

          // POST-MIGRATION VERIFICATION: re-read and confirm
          const verifyRecords = await base44.asServiceRole.entities[match.entity].filter({ id: match.record_id });
          const verifiedRecord = verifyRecords[0];
          let verified = false;

          if (verifiedRecord) {
            const verifiedValue = verifiedRecord[match.field];
            if (match.match_type === 'array_element' && Array.isArray(verifiedValue)) {
              verified = !verifiedValue.some(v => typeof v === 'string' && urlsMatch(v, targetUrl, targetNorm));
            } else if (match.match_type === 'exact_string') {
              verified = !urlsMatch(verifiedValue, targetUrl, targetNorm);
            } else if (match.match_type === 'text_contains' && typeof verifiedValue === 'string') {
              verified = findUrlInText(verifiedValue, targetUrl, targetNorm).count === 0;
            }
          }

          if (verified) {
            successCount++;
            details.push({
              entity: match.entity, record_id: match.record_id, record_name: match.record_name,
              field: match.field, match_type: match.match_type, status: 'verified',
            });
          } else {
            successCount++; // Update was accepted but verification uncertain
            verificationFailures.push({
              entity: match.entity, record_id: match.record_id, field: match.field,
            });
            details.push({
              entity: match.entity, record_id: match.record_id, record_name: match.record_name,
              field: match.field, match_type: match.match_type, status: 'unverified',
            });
          }
        } catch (e) {
          console.warn(`Migration failed for ${match.entity} ${match.record_id}.${match.field}: ${e.message}`);
          failCount++;
          details.push({
            entity: match.entity, record_id: match.record_id, record_name: match.record_name,
            field: match.field, match_type: match.match_type, status: 'failed', error: e.message,
          });
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
          status: failCount === 0 && verificationFailures.length === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed'),
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
        records_verified: details.filter(d => d.status === 'verified').length,
        records_unverified: verificationFailures.length,
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