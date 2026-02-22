/**
 * SUPPLY RESOLVER LAYER
 * 
 * Centralized name resolution for Vendors and Categories.
 * NEVER display IDs anywhere in UI.
 * 
 * Resolution Order:
 * 1. Snapshot displayName (if present and non-empty)
 * 2. Joined entity lookup by ID
 * 3. Fallback labels: "Unknown Vendor" / "Uncategorized"
 */

/**
 * Resolve vendor display info
 * @param {string|null} vendorId - Vendor ID
 * @param {Object|null} vendorSnapshot - Optional snapshot with vendor_name
 * @param {Map|Object} vendorLookup - Map or object of vendor entities
 * @returns {{ id: string|null, name: string }}
 */
export function resolveVendorDisplay(vendorId, vendorSnapshot = null, vendorLookup = null) {
  // Check snapshot first
  if (vendorSnapshot?.vendor_name && vendorSnapshot.vendor_name.trim()) {
    return {
      id: vendorId || vendorSnapshot.id || null,
      name: vendorSnapshot.vendor_name.trim()
    };
  }
  
  // Check direct vendor_name string (common in commitment objects)
  if (typeof vendorSnapshot === 'string' && vendorSnapshot.trim()) {
    return {
      id: vendorId,
      name: vendorSnapshot.trim()
    };
  }
  
  // Lookup by ID
  if (vendorId && vendorLookup) {
    const vendor = vendorLookup instanceof Map 
      ? vendorLookup.get(vendorId)
      : vendorLookup[vendorId];
    
    if (vendor?.vendor_name) {
      return {
        id: vendorId,
        name: vendor.vendor_name
      };
    }
  }
  
  // Fallback
  return {
    id: vendorId || null,
    name: 'Unknown Vendor'
  };
}

/**
 * Resolve category display info
 * @param {string|null} categoryId - Category ID
 * @param {Object|null} categorySnapshot - Optional snapshot with name
 * @param {Map|Object} categoryLookup - Map or object of category entities
 * @returns {{ id: string|null, name: string, parentName: string|null }}
 */
export function resolveCategoryDisplay(categoryId, categorySnapshot = null, categoryLookup = null) {
  // Check snapshot first
  if (categorySnapshot?.name && categorySnapshot.name.trim()) {
    let parentName = null;
    if (categorySnapshot.parent_id && categoryLookup) {
      const parent = categoryLookup instanceof Map 
        ? categoryLookup.get(categorySnapshot.parent_id)
        : categoryLookup[categorySnapshot.parent_id];
      parentName = parent?.name || null;
    }
    
    return {
      id: categoryId || categorySnapshot.id || null,
      name: categorySnapshot.name.trim(),
      parentName
    };
  }
  
  // Check direct category_name string
  if (typeof categorySnapshot === 'string' && categorySnapshot.trim()) {
    return {
      id: categoryId,
      name: categorySnapshot.trim(),
      parentName: null
    };
  }
  
  // Lookup by ID
  if (categoryId && categoryLookup) {
    const category = categoryLookup instanceof Map 
      ? categoryLookup.get(categoryId)
      : categoryLookup[categoryId];
    
    if (category?.name) {
      let parentName = null;
      if (category.parent_id) {
        const parent = categoryLookup instanceof Map 
          ? categoryLookup.get(category.parent_id)
          : categoryLookup[category.parent_id];
        parentName = parent?.name || null;
      }
      
      return {
        id: categoryId,
        name: category.name,
        parentName
      };
    }
  }
  
  // Fallback
  return {
    id: categoryId || null,
    name: 'Uncategorized',
    parentName: null
  };
}

/**
 * Format category display with optional parent hierarchy
 * @param {{ name: string, parentName: string|null }} resolved 
 * @param {boolean} showParent - Whether to show parent hierarchy
 * @returns {string}
 */
export function formatCategoryDisplay(resolved, showParent = false) {
  if (showParent && resolved.parentName) {
    return `${resolved.parentName} → ${resolved.name}`;
  }
  return resolved.name;
}

/**
 * Build vendor lookup map from array
 * @param {Array} vendors - Array of vendor objects with id and vendor_name
 * @returns {Map<string, Object>}
 */
export function buildVendorLookup(vendors = []) {
  const map = new Map();
  for (const v of vendors) {
    if (v?.id) {
      map.set(v.id, v);
    }
  }
  return map;
}

/**
 * Build category lookup map from array
 * @param {Array} categories - Array of category objects with id and name
 * @returns {Map<string, Object>}
 */
export function buildCategoryLookup(categories = []) {
  const map = new Map();
  for (const c of categories) {
    if (c?.id) {
      map.set(c.id, c);
    }
  }
  return map;
}

/**
 * Check if a value looks like an ID (UUID or ObjectId)
 * Used for diagnostics only - not normal UI
 */
export function looksLikeId(value) {
  if (!value || typeof value !== 'string') return false;
  
  // UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }
  
  // MongoDB ObjectId pattern (24 hex chars)
  if (/^[0-9a-f]{24}$/i.test(value)) {
    return true;
  }
  
  // Generic ID-like patterns (mostly alphanumeric, 12+ chars)
  if (/^[a-zA-Z0-9_-]{12,}$/.test(value) && !/\s/.test(value)) {
    return true;
  }
  
  return false;
}