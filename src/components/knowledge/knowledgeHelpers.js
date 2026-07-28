/**
 * Shared Knowledge Article helpers — single source of truth.
 * 
 * Normalizes BuildKnowledgeItem and ProcedureEntry records
 * for consistent display across all Build Knowledge surfaces.
 */

// ─── Format Configuration ───────────────────────────────
// Canonical format values — maps post_type/type to user-facing labels
export const FORMAT_CONFIG = {
  procedure:   { label: "Procedure",       dot: "bg-blue-500",    icon: "ListOrdered" },
  guide:       { label: "Guide",           dot: "bg-emerald-500", icon: "BookOpen" },
  observation: { label: "Guide",           dot: "bg-emerald-500", icon: "BookOpen" },
  known_issue: { label: "Troubleshooting", dot: "bg-amber-500",   icon: "AlertTriangle" },
  reference:   { label: "Reference",       dot: "bg-gray-500",    icon: "FileText" },
  tip:         { label: "Guide",           dot: "bg-emerald-500", icon: "BookOpen" },
  checklist:   { label: "Checklist",       dot: "bg-purple-500",  icon: "CheckSquare" },
};

// Format options for the editor
export const FORMAT_OPTIONS = [
  { value: "procedure",   label: "Procedure" },
  { value: "guide",       label: "Guide" },
  { value: "reference",   label: "Reference" },
  { value: "checklist",   label: "Checklist" },
  { value: "known_issue", label: "Troubleshooting" },
];

// Entry type configuration
export const ENTRY_TYPE_OPTIONS = [
  { value: "step",    label: "Step" },
  { value: "note",    label: "Note" },
  { value: "issue",   label: "Warning" },
  { value: "media",   label: "Photos" },
];

// ─── Article Normalization ──────────────────────────────

/**
 * Normalize a BuildKnowledgeItem for consistent UI consumption.
 * All surfaces should read from the normalized shape, not raw fields.
 */
export function normalizeKnowledgeArticle(item, categories = []) {
  if (!item) return null;

  const format = item.post_type || item.type || 'procedure';
  const formatConfig = FORMAT_CONFIG[format] || FORMAT_CONFIG.procedure;
  const category = categories.find(c => c.id === item.category_id) || null;
  const subcategory = categories.find(c => c.id === item.subcategory_id) || null;

  return {
    // Identity
    id: item.id,
    title: item.title || 'Untitled',
    slug: item.slug || '',
    summary: item.summary || '',

    // Organization
    format,
    formatLabel: formatConfig.label,
    formatDot: formatConfig.dot,
    category,
    categoryId: item.category_id || null,
    subcategory,
    subcategoryId: item.subcategory_id || null,
    vehicleTags: item.vehicle_tags || [],

    // Status & State
    status: item.status || 'draft',
    isDraft: item.status === 'draft',
    isPublished: item.status === 'published',
    isArchived: item.status === 'archived',
    isPinned: item.is_pinned || false,
    isMaster: item.is_master_procedure || false,
    isObsolete: item.is_obsolete || false,
    supersededById: item.superseded_by_id || null,

    // Hierarchy
    parentProcedureId: item.parent_procedure_id || null,

    // Media
    coverImage: getCoverImage(item),
    referenceUrl: item.reference_url || '',
    attachments: item.attachments || [],
    imageUrls: item.image_urls || [],
    mediaUrls: item.media_urls || [],

    // Legacy content (preserved but not primary)
    contentHtml: item.content_html || '',
    contentBlocks: item.content_blocks || [],
    hasLegacyContent: !!(
      (item.content_html && item.content_html !== '<p><br></p>') ||
      item.content_blocks?.length > 0 ||
      item.known_issues?.length > 0 ||
      item.tips?.length > 0 ||
      item.warnings?.length > 0
    ),

    // Versioning
    version: item.version || 1,
    changelog: item.changelog || [],

    // Dates
    createdDate: item.created_date,
    updatedDate: item.updated_date,

    // Raw record for mutations
    _raw: item,
  };
}

/**
 * Normalize a ProcedureEntry for consistent UI consumption.
 */
export function normalizeKnowledgeEntry(entry) {
  if (!entry) return null;

  const entryType = entry.entry_type || 'step';
  const lifecycle = entry.lifecycle_state || 'active';

  return {
    id: entry.id,
    articleId: entry.procedure_id,
    entryType,
    headline: entry.headline || '',
    contentHtml: entry.content_html || '',
    hasContent: !!(entry.content_html && entry.content_html !== '<p><br></p>'),
    images: entry.image_urls || [],
    referenceUrl: entry.reference_url || '',
    orderIndex: entry.order_index ?? 0,
    groupLabel: entry.group_label || null,
    partIds: entry.part_ids || [],
    lifecycle,
    isArchived: lifecycle === 'archived',
    isCritical: lifecycle === 'critical',
    isPinned: lifecycle === 'pinned',
    isStep: entryType === 'step',
    isWarning: entryType === 'issue',
    createdDate: entry.created_date,
    updatedDate: entry.updated_date,
    _raw: entry,
  };
}

// ─── Shared Utilities ───────────────────────────────────

/**
 * Extract the best cover image from an article.
 * Used by cards, compact rows, and detail views.
 */
export function getCoverImage(item) {
  if (!item) return null;
  if (item.cover_image_url) return item.cover_image_url;
  if (item.image_urls?.length > 0) return item.image_urls[0];
  if (item.media_urls?.length > 0) return item.media_urls[0];
  // Check for embedded images in HTML content
  if (item.content_html) {
    const match = item.content_html.match(/<img[^>]+src="([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract a plain-text excerpt from an article.
 * Used in cards, search results, and compact rows.
 */
export function getExcerpt(item, maxLength = 140) {
  if (!item) return null;
  if (item.summary) return item.summary;
  if (item.content_html) {
    const text = item.content_html.replace(/<[^>]*>/g, '').trim();
    return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
  }
  return null;
}

/**
 * Map legacy type/post_type to canonical format value.
 */
export function resolveFormat(item) {
  return item?.post_type || item?.type || 'procedure';
}

// ─── Query Key Convention ───────────────────────────────
export const KNOWLEDGE_QUERY_KEYS = {
  articles: ['buildKnowledgeItems'],
  article: (id) => ['buildKnowledgeItem', id],
  entries: (articleId) => ['procedureEntries', articleId],
  allEntries: ['allProcedureEntries'],
  categories: ['partCategories'],
  partLinks: (articleId) => ['knowledgePartLinks', articleId],
  taskLinks: (articleId) => ['knowledgeTaskLinks_detail', articleId],
  projectNotes: (articleId) => ['knowledgeProjectNotes', articleId],
};