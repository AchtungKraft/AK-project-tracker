/**
 * extractLinks.js — Parse HTML/text content and extract normalized link objects
 * with YouTube thumbnail detection and image URL detection.
 */

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i;

function getYoutubeThumbnail(url) {
  const match = url.match(YOUTUBE_REGEX);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function isImageUrl(url) {
  return IMAGE_EXTENSIONS.test(url);
}

function classifyLink(url) {
  if (YOUTUBE_REGEX.test(url)) return 'youtube';
  if (isImageUrl(url)) return 'image';
  return 'link';
}

function getPreviewImage(url, type) {
  if (type === 'youtube') return getYoutubeThumbnail(url);
  if (type === 'image') return url;
  return null;
}

/**
 * Extract links from an HTML string.
 * Returns array of { url, title, description, previewImage, type }
 */
export function extractLinksFromHtml(html) {
  if (!html || typeof html !== 'string') return [];

  // Use regex to extract <a> tags — avoids needing DOMParser in all contexts
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  const results = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1]?.trim();
    if (!url || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    // Strip HTML tags from the anchor text
    const rawTitle = match[2]?.replace(/<[^>]*>/g, '').trim() || '';
    const title = rawTitle || url;
    const type = classifyLink(url);

    results.push({
      url,
      title,
      description: null,
      previewImage: getPreviewImage(url, type),
      type,
    });
  }

  return results;
}

/**
 * Extract links from plain text (body field).
 * Finds bare URLs in text.
 */
export function extractLinksFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const seen = new Set();
  const results = [];
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?)]+$/, ''); // trim trailing punctuation
    if (seen.has(url)) continue;
    seen.add(url);

    const type = classifyLink(url);
    results.push({
      url,
      title: url,
      description: null,
      previewImage: getPreviewImage(url, type),
      type,
    });
  }

  return results;
}

/**
 * Normalize a URL for deduplication (strip query params and trailing slash).
 */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString().replace(/\/+$/, '');
  } catch {
    return (url || '').toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Convert structured link objects (from comment.links[]) into preview format.
 * These have { name, url, description, type } shape.
 */
export function convertStructuredLinks(links) {
  if (!links || !Array.isArray(links) || links.length === 0) return [];
  
  return links
    .filter(l => l?.url)
    .map(l => {
      const type = classifyLink(l.url);
      return {
        url: l.url,
        title: l.name || l.url,
        description:
          typeof l.description === 'string'
            ? (l.description.trim().length > 0 ? l.description.trim() : null)
            : null,
        previewImage: getPreviewImage(l.url, type),
        type,
      };
    });
}

/**
 * Combined extraction: tries HTML first, falls back to text.
 * Merges with structured links. Deduplicates against existing attachment URLs.
 */
export function extractLinks(contentHtml, bodyText, existingAttachmentUrls = [], structuredLinks = []) {
  const htmlLinks = extractLinksFromHtml(contentHtml);
  const textLinks = bodyText && htmlLinks.length === 0 ? extractLinksFromText(bodyText) : [];
  const converted = convertStructuredLinks(structuredLinks);

  // Merge all sources, deduplicate by normalized URL
  const seen = new Set();
  const merged = [];
  
  // Structured links first (they have better titles/descriptions)
  for (const link of converted) {
    const norm = normalizeUrl(link.url);
    if (!seen.has(norm)) {
      seen.add(norm);
      merged.push({
        ...link,
        description:
          typeof link.description === "string" && link.description.trim().length > 0
            ? link.description.trim()
            : null,
      });
    }
  }
  
  // Then HTML/text extracted links — merge description from structured if available
  for (const link of [...htmlLinks, ...textLinks]) {
    const norm = normalizeUrl(link.url);
    if (!seen.has(norm)) {
      // Safe merge: preserve description from structured link
      const structuredMatch = converted.find(s => normalizeUrl(s.url) === norm);
      const structuredDesc =
        typeof structuredMatch?.description === "string"
          ? structuredMatch.description.trim()
          : null;
      const extractedDesc =
        typeof link.description === "string"
          ? link.description.trim()
          : null;
      link.description =
        structuredDesc && structuredDesc.length > 0
          ? structuredDesc
          : extractedDesc && extractedDesc.length > 0
          ? extractedDesc
          : null;
      seen.add(norm);
      merged.push({
        ...link,
        description:
          typeof link.description === "string" && link.description.trim().length > 0
            ? link.description.trim()
            : null,
      });
    } else {
      // URL already in merged — safe backfill (no overwrite)
      const existing = merged.find(m => normalizeUrl(m.url) === norm);
      if (existing) {
        if (!existing.description || existing.description.trim().length === 0) {
          if (link.description && link.description.trim().length > 0) {
            existing.description = link.description.trim();
          }
        }
      }
    }
  }
  
  // Filter out URLs that match existing attachments
  const attachmentSet = new Set(
    existingAttachmentUrls.map(u => normalizeUrl(u || '')).filter(Boolean)
  );
  
  return merged.filter(link => !attachmentSet.has(normalizeUrl(link.url)));
}