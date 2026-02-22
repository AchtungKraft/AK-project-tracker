import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * SUPPLY GROUPING CONTROLS
 * 
 * Enforces max 2-level grouping.
 * 
 * Primary Group By:
 * - Project
 * - Vendor
 * - Category
 * - Lifecycle Status
 * - None
 * 
 * Optional Sub-Group:
 * - Vendor
 * - Category
 * - Status
 * 
 * Maximum 2 grouping levels only.
 * Never allow triple nesting.
 */

const STORAGE_KEY = 'supply_grouping_prefs';

const PRIMARY_OPTIONS = [
  { value: 'none', label: 'No Grouping' },
  { value: 'project', label: 'Project' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'category', label: 'Category' },
  { value: 'status', label: 'Lifecycle Status' },
];

const SUB_OPTIONS = [
  { value: 'none', label: 'No Sub-Group' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'category', label: 'Category' },
  { value: 'status', label: 'Status' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'stock_asc', label: 'In Stock (Low → High)' },
  { value: 'stock_desc', label: 'In Stock (High → Low)' },
  { value: 'cost_asc', label: 'Cost (Low → High)' },
  { value: 'cost_desc', label: 'Cost (High → Low)' },
  { value: 'retail_asc', label: 'Retail (Low → High)' },
  { value: 'retail_desc', label: 'Retail (High → Low)' },
  { value: 'status', label: 'Status' },
];

/**
 * Load persisted grouping preferences from localStorage
 */
function loadPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load grouping preferences:', e);
  }
  return {
    primaryGroup: 'category',
    subGroup: 'none',
    sortBy: 'recent',
    showClosedCancelled: false,
  };
}

/**
 * Save preferences to localStorage
 */
function savePreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save grouping preferences:', e);
  }
}

export default function SupplyGroupingControls({
  onGroupChange,
  onSortChange,
  onShowClosedChange,
  showProjectOption = true,
  className,
}) {
  const [prefs, setPrefs] = useState(loadPreferences);

  // Persist changes
  useEffect(() => {
    savePreferences(prefs);
    onGroupChange?.({ primary: prefs.primaryGroup, sub: prefs.subGroup });
    onSortChange?.(prefs.sortBy);
    onShowClosedChange?.(prefs.showClosedCancelled);
  }, [prefs, onGroupChange, onSortChange, onShowClosedChange]);

  const updatePref = (key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  // Filter sub-options to prevent duplicate grouping
  const availableSubOptions = SUB_OPTIONS.filter(opt => 
    opt.value === 'none' || opt.value !== prefs.primaryGroup
  );

  // Filter primary options based on context
  const availablePrimaryOptions = showProjectOption 
    ? PRIMARY_OPTIONS 
    : PRIMARY_OPTIONS.filter(opt => opt.value !== 'project');

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Primary Group */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-gray-500 whitespace-nowrap">Group:</Label>
        <Select value={prefs.primaryGroup} onValueChange={(v) => updatePref('primaryGroup', v)}>
          <SelectTrigger className="w-32 h-8 bg-gray-900/50 border-gray-700 text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700">
            {availablePrimaryOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sub-Group (only show if primary is not 'none') */}
      {prefs.primaryGroup !== 'none' && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-gray-500 whitespace-nowrap">Then:</Label>
          <Select value={prefs.subGroup} onValueChange={(v) => updatePref('subGroup', v)}>
            <SelectTrigger className="w-28 h-8 bg-gray-900/50 border-gray-700 text-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              {availableSubOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-gray-500 whitespace-nowrap">Sort:</Label>
        <Select value={prefs.sortBy} onValueChange={(v) => updatePref('sortBy', v)}>
          <SelectTrigger className="w-36 h-8 bg-gray-900/50 border-gray-700 text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700">
            {SORT_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Show Closed/Cancelled Toggle */}
      <div className="flex items-center gap-2 ml-auto">
        <Switch 
          id="show-closed"
          checked={prefs.showClosedCancelled}
          onCheckedChange={(v) => updatePref('showClosedCancelled', v)}
          className="h-4 w-8"
        />
        <Label 
          htmlFor="show-closed" 
          className="text-xs text-gray-500 cursor-pointer whitespace-nowrap"
        >
          Show Closed / Cancelled
        </Label>
      </div>
    </div>
  );
}

/**
 * Apply grouping to items
 */
export function applyGrouping(items, primary, sub, lookups = {}) {
  if (primary === 'none') {
    return [{ key: 'all', name: 'All Items', items, subGroups: null }];
  }

  const getGroupKey = (item, groupBy) => {
    switch (groupBy) {
      case 'project':
        return item.project_id || 'no-project';
      case 'vendor':
        return item.vendor?.id || item.vendor_id || 'no-vendor';
      case 'category':
        return item.categoryId || item.category_id || 'uncategorized';
      case 'status':
        return item.commitment_status || 'unknown';
      default:
        return 'all';
    }
  };

  const getGroupName = (key, groupBy) => {
    switch (groupBy) {
      case 'project':
        return lookups.projects?.[key]?.name || key;
      case 'vendor':
        return lookups.vendors?.[key]?.vendor_name || (key === 'no-vendor' ? 'No Vendor' : key);
      case 'category':
        return lookups.categories?.[key]?.name || (key === 'uncategorized' ? 'Uncategorized' : key);
      case 'status':
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      default:
        return 'All';
    }
  };

  // Primary grouping
  const primaryGroups = {};
  for (const item of items) {
    const key = getGroupKey(item, primary);
    if (!primaryGroups[key]) {
      primaryGroups[key] = {
        key,
        name: getGroupName(key, primary),
        items: [],
        subGroups: null,
      };
    }
    primaryGroups[key].items.push(item);
  }

  // Apply sub-grouping if needed
  if (sub && sub !== 'none') {
    for (const group of Object.values(primaryGroups)) {
      const subGroups = {};
      for (const item of group.items) {
        const subKey = getGroupKey(item, sub);
        if (!subGroups[subKey]) {
          subGroups[subKey] = {
            key: subKey,
            name: getGroupName(subKey, sub),
            items: [],
          };
        }
        subGroups[subKey].items.push(item);
      }
      group.subGroups = Object.values(subGroups);
    }
  }

  return Object.values(primaryGroups);
}

/**
 * Apply sorting to items
 */
export function applySorting(items, sortBy) {
  const sorted = [...items];
  
  switch (sortBy) {
    case 'recent':
      sorted.sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0));
      break;
    case 'stock_asc':
      sorted.sort((a, b) => (a.inventory_snapshot?.physical ?? 0) - (b.inventory_snapshot?.physical ?? 0));
      break;
    case 'stock_desc':
      sorted.sort((a, b) => (b.inventory_snapshot?.physical ?? 0) - (a.inventory_snapshot?.physical ?? 0));
      break;
    case 'cost_asc':
      sorted.sort((a, b) => (a.unit_cost ?? 0) - (b.unit_cost ?? 0));
      break;
    case 'cost_desc':
      sorted.sort((a, b) => (b.unit_cost ?? 0) - (a.unit_cost ?? 0));
      break;
    case 'retail_asc':
      sorted.sort((a, b) => (a.unit_retail ?? 0) - (b.unit_retail ?? 0));
      break;
    case 'retail_desc':
      sorted.sort((a, b) => (b.unit_retail ?? 0) - (a.unit_retail ?? 0));
      break;
    case 'status':
      const statusOrder = ['planned', 'ordered', 'partially_received', 'received', 'partially_installed', 'installed', 'cancelled', 'closed'];
      sorted.sort((a, b) => statusOrder.indexOf(a.commitment_status) - statusOrder.indexOf(b.commitment_status));
      break;
    default:
      // No sorting
      break;
  }
  
  return sorted;
}