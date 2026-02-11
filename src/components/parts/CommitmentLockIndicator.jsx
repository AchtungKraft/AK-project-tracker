import React from "react";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * CommitmentLockIndicator - Shows whether a requirement is managed by commitments
 * 
 * When locked:
 * - qty_allocated, qty_ordered, qty_installed are read-only
 * - Changes must go through commitment workflow
 */
export default function CommitmentLockIndicator({ 
  isLocked, 
  commitmentCount = 0,
  size = 'default',
  showLabel = true 
}) {
  if (!isLocked) {
    return null; // Don't show anything for unlocked items
  }

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`border-purple-600 text-purple-400 cursor-help ${size === 'sm' ? 'text-xs px-1.5 py-0' : ''}`}
          >
            <Lock className={`${iconSize} ${showLabel ? 'mr-1' : ''}`} />
            {showLabel && 'Managed'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-gray-900 border-gray-700 text-gray-100">
          <div className="text-sm">
            <p className="font-medium text-purple-400">Managed by Commitments</p>
            <p className="text-gray-400 text-xs mt-1">
              {commitmentCount > 0 
                ? `${commitmentCount} commitment${commitmentCount > 1 ? 's' : ''} linked`
                : 'Allocation/ordering tracked via commitments'
              }
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Edit through commitment workflow
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Inline lock icon for compact displays
 */
export function CommitmentLockIcon({ isLocked, size = 'default' }) {
  if (!isLocked) return null;
  
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Lock className={`${iconSize} text-purple-400 cursor-help`} />
        </TooltipTrigger>
        <TooltipContent className="bg-gray-900 border-gray-700">
          <span className="text-xs text-purple-400">Managed by Commitments</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}