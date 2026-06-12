/**
 * Media Library helpers — folder extraction, sorting, URL parsing
 */

const MEDIA_BASE = 'https://media.base44.com/images/public/';

/**
 * Parse a full media URL to extract relative path
 */
export function parseMediaUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  
  // Handle media.base44.com URLs
  if (trimmed.startsWith(MEDIA_BASE)) {
    return trimmed.substring(MEDIA_BASE.length);
  }
  
  // Handle base44 storage URLs — extract filename portion
  const match = trimmed.match(/\/([^/]+\.[a-zA-Z]+)(\?|$)/);
  if (match) return match[1];
  
  return null;
}

/**
 * Extract unique folders from assets in a given path
 */
export function extractFolders(assets, currentPath) {
  const folders = new Set();
  
  assets.forEach(asset => {
    const folderPath = asset.folder_path || '';
    
    if (currentPath === '') {
      // Root level — show top-level folder segments
      if (folderPath) {
        const topFolder = folderPath.split('/')[0];
        if (topFolder) folders.add(topFolder);
      }
    } else {
      // Inside a folder — show immediate subfolders
      if (folderPath.startsWith(currentPath + '/')) {
        const remaining = folderPath.substring(currentPath.length + 1);
        const nextSegment = remaining.split('/')[0];
        if (nextSegment) folders.add(nextSegment);
      }
    }
  });
  
  return Array.from(folders).sort();
}

/**
 * Get assets that belong directly in the given folder path
 */
export function getAssetsInFolder(assets, currentPath) {
  return assets.filter(asset => {
    const assetFolder = asset.folder_path || '';
    return assetFolder === currentPath;
  });
}

/**
 * Sort assets by the given sort key
 */
export function sortAssets(assets, sortBy) {
  const sorted = [...assets];
  switch (sortBy) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
    case 'filename':
      return sorted.sort((a, b) => (a.file_name || '').localeCompare(b.file_name || ''));
    case 'size':
      return sorted.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
    case 'modified':
      return sorted.sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0));
    default:
      return sorted;
  }
}

/**
 * Filter assets by search term
 */
export function searchAssets(assets, term) {
  if (!term) return assets;
  const lower = term.toLowerCase();
  return assets.filter(a =>
    (a.file_name || '').toLowerCase().includes(lower) ||
    (a.folder_path || '').toLowerCase().includes(lower) ||
    (a.full_relative_path || '').toLowerCase().includes(lower) ||
    (a.public_url || '').toLowerCase().includes(lower) ||
    (a.notes || '').toLowerCase().includes(lower) ||
    (a.title || '').toLowerCase().includes(lower)
  );
}

/**
 * Filter assets by status
 */
export function filterByStatus(assets, status) {
  if (status === 'all') return assets;
  if (status === 'archived') return assets.filter(a => a.archived);
  return assets.filter(a => !a.archived);
}