import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Deep-scanning media reference migration engine.
 *
 * Supports: string fields, arrays, arrays of objects, nested objects,
 * HTML img/background-image, Markdown images, serialized JSON strings.
 *
 * Modes:
 *   scan    — returns preview of all references found
 *   migrate — replaces old URL with new URL, verifies, creates audit record
 */

// ──────────────────────────────────────────────────────
//  SCAN CONFIGURATION
// ──────────────────────────────────────────────────────
// Each entity lists ALL fields that could contain image URLs.
// The deep scanner will recursively inspect every value regardless of type.
// Fields are categorised for performance — we skip fields not listed.
const SCAN_CONFIG = [
  { entity: 'Project',                    fields: ['images', 'featured_image_url'] },
  { entity: 'Part',                       fields: ['photos', 'featured_photo', 'notes'] },
  { entity: 'Comment',                    fields: ['images', 'content'] },
  { entity: 'TaskComment',               fields: ['photos', 'content', 'links'] },
  { entity: 'JournalEntry',              fields: ['photos', 'content', 'content_html', 'attachments', 'links'] },
  { entity: 'ClientFeedbackAttachment',  fields: ['file_url'] },
  { entity: 'ClientFeedbackComment',     fields: ['photos', 'body', 'content_html', 'content_fallback', 'files', 'links'] },
  { entity: 'ClientFeedbackRequest',     fields: ['body'] },
  { entity: 'ClientFeedbackDecision',    fields: ['target_image_url', 'note'] },
  { entity: 'BuildKnowledgeItem',        fields: ['image_urls', 'media_urls', 'cover_image_url', 'content_html', 'summary', 'content_blocks', 'attachments', 'known_issues', 'tips', 'warnings'] },
  { entity: 'BuildKnowledgeProjectNote', fields: ['photos', 'note'] },
  { entity: 'ProcedureEntry',            fields: ['image_urls', 'content_html', 'reference_url'] },
  { entity: 'EmailTemplate',             fields: ['body_intro', 'closing_text'] },
  { entity: 'Task',                       fields: ['description'] },
  { entity: 'ToDoListTask',              fields: ['images', 'details'] },
  { entity: 'PageBlock',                  fields: ['data'] },
  { entity: 'SharedBlock',               fields: ['data'] },
];

// ──────────────────────────────────────────────────────
//  URL NORMALISATION
// ──────────────────────────────────────────────────────
const BASE44_APP_PREFIX = 'https://base44.app/api/apps/';
const BASE44_MEDIA_PREFIX = 'https://media.base44.com/images/public/';

function normalizeBase44Url(url) {
  if (!url || typeof url !== 'string') return null;
  let clean = url.split('?')[0];
  try { clean = decodeURIComponent(clean); } catch {}

  const appMatch = clean.match(/base44\.app\/api\/apps\/[^/]+\/files\/mp\/public\/(.+)$/);
  if (appMatch) return { canonical: appMatch[1], isBase44: true, cleanUrl: clean };

  const mediaMatch = clean.match(/media\.base44\.com\/images\/public\/(.+)$/);
  if (mediaMatch) return { canonical: mediaMatch[1], isBase44: true, cleanUrl: clean };

  return { canonical: clean, isBase44: false, cleanUrl: clean };
}

function urlsMatch(candidateUrl, targetUrl, targetNorm) {
  if (!candidateUrl || !targetUrl) return false;
  if (candidateUrl === targetUrl) return true;

  const cleanCandidate = candidateUrl.split('?')[0];
  const cleanTarget = targetUrl.split('?')[0];
  if (cleanCandidate === cleanTarget) return true;

  if (!targetNorm) targetNorm = normalizeBase44Url(targetUrl);
  const candidateNorm = normalizeBase44Url(candidateUrl);
  if (targetNorm?.isBase44 && candidateNorm?.isBase44 && targetNorm.canonical === candidateNorm.canonical) return true;

  return false;
}

function buildAlternateUrls(originalUrl, norm) {
  const alternates = [];
  if (!norm?.isBase44 || !norm.canonical) return alternates;
  const clean = originalUrl.split('?')[0];
  if (clean.includes('base44.app/api/apps/')) {
    alternates.push(BASE44_MEDIA_PREFIX + norm.canonical);
  }
  return alternates;
}

// ──────────────────────────────────────────────────────
//  TEXT / HTML / MARKDOWN URL DETECTION
// ──────────────────────────────────────────────────────

/** Find all occurrences of targetUrl (and its alternates) in a text string. */
function findUrlInText(text, targetUrl, targetNorm) {
  if (!text || typeof text !== 'string') return { count: 0 };
  let count = 0;

  const searchTerms = [targetUrl];
  if (targetNorm?.isBase44) {
    searchTerms.push(...buildAlternateUrls(targetUrl, targetNorm));
  }

  for (const term of searchTerms) {
    let idx = 0;
    while ((idx = text.indexOf(term, idx)) !== -1) {
      count++;
      idx += term.length;
    }
  }
  return { count };
}

/** Replace all occurrences of targetUrl (and its alternates) in text. */
function replaceUrlInText(text, targetUrl, replacementUrl, targetNorm) {
  if (!text || typeof text !== 'string') return text;
  let result = text.split(targetUrl).join(replacementUrl);
  if (targetNorm?.isBase44) {
    for (const alt of buildAlternateUrls(targetUrl, targetNorm)) {
      result = result.split(alt).join(replacementUrl);
    }
  }
  return result;
}

/** Classify how a URL appears in text content. */
function classifyTextMatch(text, targetUrl, targetNorm) {
  if (!text || typeof text !== 'string') return null;

  const searchTerms = [targetUrl];
  if (targetNorm?.isBase44) searchTerms.push(...buildAlternateUrls(targetUrl, targetNorm));

  for (const term of searchTerms) {
    const idx = text.indexOf(term);
    if (idx === -1) continue;

    // Check context around the match
    const before = text.substring(Math.max(0, idx - 80), idx);
    const after = text.substring(idx + term.length, idx + term.length + 20);

    // HTML <img src="...">
    if (/src\s*=\s*["']?\s*$/.test(before)) return 'html_image';
    // CSS background-image: url(...)
    if (/url\s*\(\s*["']?\s*$/.test(before)) return 'html_background';
    // Markdown ![alt](url)
    if (/!\[[^\]]*\]\(\s*$/.test(before)) return 'markdown_image';
    // Markdown link [text](url)
    if (/\[[^\]]*\]\(\s*$/.test(before)) return 'markdown_link';
    // JSON-as-string: the text itself looks like serialised JSON
    if (before.includes('{"') || before.includes('":')) return 'json_blob';
    // Generic text/HTML embed
    return 'text_embed';
  }
  return null;
}

// ──────────────────────────────────────────────────────
//  DEEP RECURSIVE SCANNER
// ──────────────────────────────────────────────────────

/**
 * Recursively scan a value for URL matches.
 * Returns array of match descriptors.
 */
function deepScan(value, targetUrl, targetNorm, path) {
  const matches = [];

  if (value === null || value === undefined) return matches;

  if (typeof value === 'string') {
    // Exact URL match (standalone string field or array element)
    if (urlsMatch(value, targetUrl, targetNorm)) {
      matches.push({ path, matchType: path.includes('[') ? 'array_item' : 'string_field', count: 1 });
      return matches;
    }
    // Text/HTML/Markdown embedded URL
    const { count } = findUrlInText(value, targetUrl, targetNorm);
    if (count > 0) {
      const classification = classifyTextMatch(value, targetUrl, targetNorm) || 'text_embed';
      matches.push({ path, matchType: classification, count });
    }
    return matches;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const childMatches = deepScan(value[i], targetUrl, targetNorm, `${path}[${i}]`);
      matches.push(...childMatches);
    }
    return matches;
  }

  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const childMatches = deepScan(value[key], targetUrl, targetNorm, `${path}.${key}`);
      matches.push(...childMatches);
    }
    return matches;
  }

  return matches;
}

/**
 * Recursively replace URL in a value. Returns new value.
 */
function deepReplace(value, targetUrl, replacementUrl, targetNorm) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Exact URL match
    if (urlsMatch(value, targetUrl, targetNorm)) return replacementUrl;
    // Text/HTML/Markdown embedded
    if (findUrlInText(value, targetUrl, targetNorm).count > 0) {
      return replaceUrlInText(value, targetUrl, replacementUrl, targetNorm);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => deepReplace(item, targetUrl, replacementUrl, targetNorm));
  }

  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = deepReplace(value[key], targetUrl, replacementUrl, targetNorm);
    }
    return result;
  }

  return value;
}

/**
 * Recursively verify no old URL remains in a value.
 */
function deepVerify(value, targetUrl, targetNorm) {
  if (value === null || value === undefined) return true;

  if (typeof value === 'string') {
    if (urlsMatch(value, targetUrl, targetNorm)) return false;
    if (findUrlInText(value, targetUrl, targetNorm).count > 0) return false;
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(item => deepVerify(item, targetUrl, targetNorm));
  }

  if (typeof value === 'object') {
    return Object.values(value).every(v => deepVerify(v, targetUrl, targetNorm));
  }

  return true;
}

// ──────────────────────────────────────────────────────
//  MATCH TYPE LABELS (for reporting)
// ──────────────────────────────────────────────────────
const MATCH_TYPE_TO_LABEL = {
  string_field: 'String Field',
  array_item: 'Array Item',
  nested_object: 'Nested Object',
  html_image: 'HTML Image',
  html_background: 'HTML Background',
  markdown_image: 'Markdown Image',
  markdown_link: 'Markdown Link',
  json_blob: 'JSON Blob',
  text_embed: 'Text Embed',
};

function getRecordName(entity, record) {
  return record.name || record.title || record.headline || record.file_name ||
    record.template_name || record.part_name || record.pool_name ||
    `${entity} #${record.id?.slice(-6)}`;
}

// Determine a high-level match type from deep-scan path + matchType
function resolveMatchType(path, rawType) {
  // If the path shows nesting beyond field[i] or field.key, it's nested_object
  const depth = (path.match(/\./g) || []).length;
  if (rawType === 'string_field' && depth > 1) return 'nested_object';
  if (rawType === 'array_item' && depth > 0) return 'nested_object';
  return rawType;
}

// ──────────────────────────────────────────────────────
//  HANDLER
// ──────────────────────────────────────────────────────

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

    // ── Scan all entities ──
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
        for (const field of config.fields) {
          const value = record[field];
          if (value === null || value === undefined) continue;

          const fieldMatches = deepScan(value, targetUrl, targetNorm, field);

          if (fieldMatches.length > 0) {
            // Aggregate matches for this field
            const totalCount = fieldMatches.reduce((s, m) => s + m.count, 0);

            // Pick the most specific match type
            const matchTypes = [...new Set(fieldMatches.map(m => resolveMatchType(m.path, m.matchType)))];
            const primaryType = matchTypes.length === 1 ? matchTypes[0] : 'nested_object';

            // Build a snippet for text matches
            let beforeSnippet = null;
            let afterSnippet = null;
            if (typeof value === 'string' && findUrlInText(value, targetUrl, targetNorm).count > 0) {
              const idx = value.indexOf(targetUrl);
              const actualIdx = idx >= 0 ? idx : 0;
              const start = Math.max(0, actualIdx - 40);
              const end = Math.min(value.length, actualIdx + targetUrl.length + 40);
              beforeSnippet = (start > 0 ? '...' : '') + value.slice(start, end) + (end < value.length ? '...' : '');
              afterSnippet = replacementUrl ? beforeSnippet.split(targetUrl).join(replacementUrl) : null;
            } else if (typeof value === 'string') {
              beforeSnippet = value.length > 120 ? value.slice(0, 120) + '...' : value;
              afterSnippet = replacementUrl || null;
            } else if (Array.isArray(value)) {
              beforeSnippet = `[...${value.length} items, ${totalCount} match(es)]`;
              afterSnippet = replacementUrl ? `[...${value.length} items, replaced]` : null;
            } else if (typeof value === 'object') {
              beforeSnippet = `{object with ${Object.keys(value).length} keys, ${totalCount} match(es)}`;
              afterSnippet = replacementUrl ? `{object, replaced}` : null;
            }

            allMatches.push({
              entity: config.entity,
              record_id: record.id,
              record_name: getRecordName(config.entity, record),
              field,
              match_type: primaryType,
              match_type_label: MATCH_TYPE_TO_LABEL[primaryType] || primaryType,
              match_types_detail: matchTypes.map(t => MATCH_TYPE_TO_LABEL[t] || t),
              match_count: totalCount,
              deep_paths: fieldMatches.map(m => m.path),
              before_value: beforeSnippet,
              after_value: afterSnippet,
            });
          }
        }
      }
    }

    // ── SCAN mode ──
    if (mode === 'scan') {
      // Build type summary
      const typeSummary = {};
      allMatches.forEach(m => {
        (m.match_types_detail || [m.match_type_label]).forEach(t => {
          typeSummary[t] = (typeSummary[t] || 0) + m.match_count;
        });
      });

      return Response.json({
        status: 'ok',
        total_references: allMatches.reduce((s, m) => s + m.match_count, 0),
        total_records: allMatches.length,
        matches: allMatches,
        type_summary: typeSummary,
      });
    }

    // ── MIGRATE mode ──
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
          // Re-fetch fresh record
          const freshRecords = await base44.asServiceRole.entities[match.entity].filter({ id: match.record_id });
          const record = freshRecords[0];
          if (!record) {
            failCount++;
            details.push({ entity: match.entity, record_id: match.record_id, record_name: match.record_name, field: match.field, match_type: match.match_type, match_type_label: match.match_type_label, status: 'failed', error: 'Record not found' });
            continue;
          }

          const currentValue = record[match.field];
          const updatedValue = deepReplace(currentValue, targetUrl, replacementUrl, targetNorm);

          await base44.asServiceRole.entities[match.entity].update(match.record_id, { [match.field]: updatedValue });

          // Post-migration verification
          const verifyRecords = await base44.asServiceRole.entities[match.entity].filter({ id: match.record_id });
          const verifiedRecord = verifyRecords[0];
          const verified = verifiedRecord ? deepVerify(verifiedRecord[match.field], targetUrl, targetNorm) : false;

          if (verified) {
            successCount++;
            details.push({ entity: match.entity, record_id: match.record_id, record_name: match.record_name, field: match.field, match_type: match.match_type, match_type_label: match.match_type_label, status: 'verified' });
          } else {
            successCount++;
            verificationFailures.push({ entity: match.entity, record_id: match.record_id, field: match.field });
            details.push({ entity: match.entity, record_id: match.record_id, record_name: match.record_name, field: match.field, match_type: match.match_type, match_type_label: match.match_type_label, status: 'unverified' });
          }
        } catch (e) {
          console.warn(`Migration failed for ${match.entity} ${match.record_id}.${match.field}: ${e.message}`);
          failCount++;
          details.push({ entity: match.entity, record_id: match.record_id, record_name: match.record_name, field: match.field, match_type: match.match_type, match_type_label: match.match_type_label, status: 'failed', error: e.message });
        }
      }

      // Mark old asset superseded
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
          references_found: allMatches.reduce((s, m) => s + m.match_count, 0),
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

      // Build type summary
      const typeSummary = {};
      details.filter(d => d.status !== 'failed').forEach(d => {
        const label = d.match_type_label || d.match_type;
        typeSummary[label] = (typeSummary[label] || 0) + 1;
      });

      return Response.json({
        status: 'ok',
        references_found: allMatches.reduce((s, m) => s + m.match_count, 0),
        records_modified: successCount,
        records_failed: failCount,
        records_verified: details.filter(d => d.status === 'verified').length,
        records_unverified: verificationFailures.length,
        migration_id: migrationId,
        old_asset_superseded: !!old_asset_id,
        details,
        type_summary: typeSummary,
      });
    }

    return Response.json({ error: 'Invalid mode. Use "scan" or "migrate".' }, { status: 400 });
  } catch (error) {
    console.error('scanMediaReferences error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});