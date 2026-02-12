import React, { useState } from 'react';
import { useIsMobile } from './useIsMobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobileFilterTriggerBar
 * Compact filter control row for mobile, replacing large persistent filter blocks.
 * Desktop: renders children (original filter UI) unchanged.
 */
export default function MobileFilterTriggerBar({ 
  activeFilterCount = 0,
  searchValue = '',
  onSearchChange,
  onFilterClick,
  onSortClick,
  searchPlaceholder = 'Search...',
  showSort = true,
  children, // Desktop filter content
  className = ''
}) {
  const isMobile = useIsMobile();
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Desktop: render original filter content
  if (!isMobile) {
    return <>{children}</>;
  }

  // Mobile: compact trigger bar
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Filter Button */}
      <Button
        variant="outline"
        onClick={onFilterClick}
        className={cn(
          'min-h-[44px] border-gray-700 gap-2 flex-shrink-0',
          activeFilterCount > 0 && 'border-red-500/50 text-red-400'
        )}
      >
        <Filter className="w-4 h-4" />
        <span>Filter</span>
        {activeFilterCount > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-red-600 text-white rounded-full min-w-[20px] text-center">
            {activeFilterCount}
          </span>
        )}
      </Button>

      {/* Search Field */}
      <div className={cn(
        'relative flex-1 transition-all duration-200',
        searchExpanded ? 'flex-[2]' : ''
      )}>
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onFocus={() => setSearchExpanded(true)}
          onBlur={() => setSearchExpanded(false)}
          className="pl-9 pr-8 min-h-[44px] bg-gray-900/50 border-gray-700 text-white"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange?.('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sort/View Button */}
      {showSort && onSortClick && (
        <Button
          variant="outline"
          size="icon"
          onClick={onSortClick}
          className="min-h-[44px] min-w-[44px] border-gray-700 flex-shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Hook to count active filters from a filter state object
 */
export function useActiveFilterCount(filters, defaults = {}) {
  let count = 0;
  
  Object.entries(filters).forEach(([key, value]) => {
    const defaultValue = defaults[key];
    
    if (Array.isArray(value)) {
      if (value.length > 0 && (!defaultValue || value.length !== defaultValue.length)) {
        count++;
      }
    } else if (value !== defaultValue && value !== 'all' && value !== '') {
      count++;
    }
  });
  
  return count;
}