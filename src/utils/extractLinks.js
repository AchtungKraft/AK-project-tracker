/**
 * extractLinks.js — Parse HTML/text content and extract normalized link objects
 * with YouTube thumbnail detection and image URL detection.
 */

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
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
 * Combined extraction: tries HTML first, falls back to text.
 * Deduplicates against a set of existing attachment URLs.
 */
export function extractLinks(contentHtml, bodyText, existingAttachmentUrls = []) {
  const htmlLinks = extractLinksFromHtml(contentHtml);
  const textLinks = bodyText && htmlLinks.length === 0 ? extractLinksFromText(bodyText) : [];

  const allLinks = [...htmlLinks, ...textLinks];
  
  // Deduplicate against existing attachments
  const attachmentSet = new Set(existingAttachmentUrls.map(u => u?.toLowerCase()).filter(Boolean));
  
  return allLinks.filter(link => !attachmentSet.has(link.url?.toLowerCase()));
}