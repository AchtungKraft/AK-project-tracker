import React, { useState, useMemo, useCallback } from "react";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterActiveCommitments } from "./lifecycleDisplay";
import { DesktopSupplyRow, MobileSupplyCard, SupplyTableHeader } from "./SupplyRowData";
import SupplyGroupingControls, { applyGrouping, applySorting } from "./SupplyGroupingControls";
import EditPartDrawer from "@/components/parts/EditPartDrawer";
import { formatCurrencyUSD } from "./pricingHelpers";

/**
 * UNIFIED SUPPLY LIST
 * 
 * Enforces the complete ProjectSupplyManager contract:
 * 
 * 1. Mandatory Row Data (always visible)
 * 2. Currency Formatting (USD with commas)
 * 3. Inventory Display (desktop single-line, mobile stacked)
 * 4. Inventory Logic Indicators
 * 5. Part Name Behavior (opens drawer, never navigates)
 * 6. Lifecycle Display Mapping
 * 7. Pricing Integrity Display Rules
 * 8. Grouping System (max 2 levels)
 * 9. Sorting (persisted per user)
 * 10. Mobile Layout (expandable cards, no horizontal scroll)
 * 11. Interaction Stability (mutation buttons)
 */

export default function UnifiedSupplyList({
  items,
  categories = {},
  vendors = {},
  projects = {},
  parts = {},
  renderActions, // (commitment, part, vendor) => ReactNode
  showProjectOption = true,
  emptyMessage = "No items to display",
  className,
}) {
  const isMobile = useIsMobile();
  
  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [groupConfig, setGroupConfig] = useState({ primary: 'category', sub: 'none' });
  const [sortBy, setSortBy] = useState('recent');
  const [showClosedCancelled, setShowClosedCancelled] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  
  // Part drawer state
  const [selectedPartId, setSelectedPartId] = useState(null);
  
  // Lookups for grouping
  const lookups = useMemo(() => ({
    categories,
    vendors,
    projects,
  }), [categories, vendors, projects]);
  
  // Handle part click - opens drawer
  const handlePartClick = useCallback((part, commitment) => {
    if (part?.id) {
      setSelectedPartId(part.id);
    } else if (commitment?.part_id) {
      setSelectedPartId(commitment.part_id);
    }
  }, []);
  
  // Filter and process items
  const processedItems = useMemo(() => {
    // 1. Filter closed/cancelled
    let filtered = filterActiveCommitments(items, showClosedCancelled);
    
    // 2. Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item => {
        const partName = item.part_name || item.part?.part_name || '';
        const partNumber = item.vendor_part_number || item.part?.vendor_part_number || '';
        const vendorName = item.vendor_name || '';
        return (
          partName.toLowerCase().includes(term) ||
          partNumber.toLowerCase().includes(term) ||
          vendorName.toLowerCase().includes(term)
        );
      });
    }
    
    // 3. Apply sorting
    filtered = applySorting(filtered, sortBy);
    
    // 4. Apply grouping
    const groups = applyGrouping(filtered, groupConfig.primary, groupConfig.sub, lookups);
    
    return { filtered, groups, totalCount: items.length, filteredCount: filtered.length };
  }, [items, showClosedCancelled, searchTerm, sortBy, groupConfig, lookups]);
  
  // Toggle group expansion
  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };
  
  // Check if group is expanded (default expanded for small groups)
  const isGroupExpanded = (groupKey, itemCount) => {
    if (expandedGroups.has(groupKey)) return true;
    if (expandedGroups.size === 0 && itemCount <= 10) return true; // Default expand small groups
    return false;
  };
  
  // Render group header
  const renderGroupHeader = (group, level = 0) => {
    const isExpanded = isGroupExpanded(group.key, group.items?.length || 0);
    const totalRetail = (group.items || []).reduce((sum, item) => 
      sum + (item.unit_retail || 0) * (item.required_total || item.qty_committed || 1), 0
    );
    
    return (
      <div 
        key={group.key}
        className={cn(
          "flex items-center gap-2 px-3 py-2 bg-gray-900/70 border-b border-gray-800 cursor-pointer select-none",
          level > 0 && "pl-8"
        )}
        onClick={() => toggleGroup(group.key)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
        <span className="text-sm font-medium text-gray-300">{group.name}</span>
        <span className="text-xs text-gray-500">({group.items?.length || 0})</span>
        <span className="ml-auto text-xs text-gray-500 font-mono">
          {formatCurrencyUSD(totalRetail)}
        </span>
      </div>
    );
  };
  
  // Render desktop table
  const renderDesktopTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <SupplyTableHeader showCheckbox={false} showActions={!!renderActions} />
        </thead>
        <tbody>
          {processedItems.groups.map(group => (
            <React.Fragment key={group.key}>
              {/* Primary group header */}
              {groupConfig.primary !== 'none' && (
                <tr>
                  <td colSpan={14} className="p-0">
                    {renderGroupHeader(group, 0)}
                  </td>
                </tr>
              )}
              
              {/* Sub-groups or items */}
              {isGroupExpanded(group.key, group.items?.length) && (
                <>
                  {group.subGroups ? (
                    // Render sub-groups
                    group.subGroups.map(subGroup => (
                      <React.Fragment key={`${group.key}-${subGroup.key}`}>
                        <tr>
                          <td colSpan={14} className="p-0">
                            {renderGroupHeader(subGroup, 1)}
                          </td>
                        </tr>
                        {isGroupExpanded(`${group.key}-${subGroup.key}`, subGroup.items?.length) && 
                          subGroup.items.map(item => (
                            <DesktopSupplyRow
                              key={item.commitment_id || item.id}
                              commitment={item}
                              part={parts[item.part_id] || item.part || item}
                              vendor={vendors[item.vendor_id] || item.vendor}
                              category={categories[item.category_id] || item.categoryObj}
                              categoryLookup={categories}
                              vendorLookup={vendors}
                              onPartClick={handlePartClick}
                            >
                              {renderActions?.(item, parts[item.part_id] || item.part, vendors[item.vendor_id] || item.vendor)}
                            </DesktopSupplyRow>
                          ))
                        }
                      </React.Fragment>
                    ))
                  ) : (
                    // Render items directly
                    group.items.map(item => (
                      <DesktopSupplyRow
                        key={item.commitment_id || item.id}
                        commitment={item}
                        part={parts[item.part_id] || item.part || item}
                        vendor={vendors[item.vendor_id] || item.vendor}
                        category={categories[item.category_id] || item.categoryObj}
                        categoryLookup={categories}
                        vendorLookup={vendors}
                        onPartClick={handlePartClick}
                      >
                        {renderActions?.(item, parts[item.part_id] || item.part, vendors[item.vendor_id] || item.vendor)}
                      </DesktopSupplyRow>
                    ))
                  )}
                </>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
  
  // Render mobile cards
  const renderMobileCards = () => (
    <div className="space-y-2">
      {processedItems.groups.map(group => (
        <div key={group.key} className="space-y-2">
          {/* Primary group header */}
          {groupConfig.primary !== 'none' && renderGroupHeader(group, 0)}
          
          {/* Sub-groups or items */}
          {isGroupExpanded(group.key, group.items?.length) && (
            <>
              {group.subGroups ? (
                group.subGroups.map(subGroup => (
                  <div key={`${group.key}-${subGroup.key}`} className="space-y-2 pl-4">
                    {renderGroupHeader(subGroup, 1)}
                    {isGroupExpanded(`${group.key}-${subGroup.key}`, subGroup.items?.length) && 
                      subGroup.items.map(item => (
                        <MobileSupplyCard
                          key={item.commitment_id || item.id}
                          commitment={item}
                          part={parts[item.part_id] || item.part || item}
                          vendor={vendors[item.vendor_id] || item.vendor}
                          onPartClick={handlePartClick}
                        >
                          {renderActions?.(item, parts[item.part_id] || item.part, vendors[item.vendor_id] || item.vendor)}
                        </MobileSupplyCard>
                      ))
                    }
                  </div>
                ))
              ) : (
                group.items.map(item => (
                  <MobileSupplyCard
                    key={item.commitment_id || item.id}
                    commitment={item}
                    part={parts[item.part_id] || item.part || item}
                    vendor={vendors[item.vendor_id] || item.vendor}
                    onPartClick={handlePartClick}
                  >
                    {renderActions?.(item, parts[item.part_id] || item.part, vendors[item.vendor_id] || item.vendor)}
                  </MobileSupplyCard>
                ))
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
  
  return (
    <div className={cn("space-y-3", className)}>
      {/* Controls Row */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search parts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700 text-white h-8 text-sm"
          />
        </div>
        
        {/* Grouping Controls */}
        <SupplyGroupingControls
          onGroupChange={setGroupConfig}
          onSortChange={setSortBy}
          onShowClosedChange={setShowClosedCancelled}
          showProjectOption={showProjectOption}
          className="flex-1"
        />
      </div>
      
      {/* Results Count */}
      <div className="text-xs text-gray-500">
        Showing {processedItems.filteredCount} of {processedItems.totalCount} items
      </div>
      
      {/* Content */}
      {processedItems.filteredCount === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <>
          {isMobile ? renderMobileCards() : renderDesktopTable()}
        </>
      )}
      
      {/* Edit Part Drawer */}
      {selectedPartId && (
        <EditPartDrawer
          partId={selectedPartId}
          open={!!selectedPartId}
          onClose={() => setSelectedPartId(null)}
        />
      )}
    </div>
  );
}