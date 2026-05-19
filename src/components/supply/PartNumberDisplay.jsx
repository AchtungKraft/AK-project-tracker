import React from "react";
import { Copy, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * PartNumberDisplay — Reusable copyable part number display.
 * Shows vendor part number (primary) and internal AK part name/SKU (secondary).
 * Supports click-to-copy and graceful fallback for missing numbers.
 */
export function resolveVendorPartNumber(item) {
  // Direct fields first
  if (item?.vendor_part_number) return item.vendor_part_number;
  if (item?.part?.vendor_part_number) return item.part.vendor_part_number;

  // Check vendor_sources array (from getOpsSupplyView read model)
  const sources = item?.vendor_sources || item?.sources || [];
  if (sources.length > 0) {
    const preferred = sources.find(s => s.is_preferred && s.vendor_part_number);
    if (preferred) return preferred.vendor_part_number;
    const any = sources.find(s => s.vendor_part_number);
    if (any) return any.vendor_part_number;
  }

  return item?.manufacturer_part_number || item?.sku || item?.part_number || null;
}

export default function PartNumberDisplay({ vendorPartNumber, internalPartNumber, compact = false, className }) {
  const [copiedId, setCopiedId] = React.useState(null);

  const displayNumber = vendorPartNumber || "No Part #";
  const hasVendorPart = !!vendorPartNumber;

  const handleCopy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(`Copied: ${text}`);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1 min-w-0", className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopy(hasVendorPart ? vendorPartNumber : internalPartNumber, "part number"); }}
                className={cn(
                  "flex items-center gap-0.5 text-[10px] font-mono px-1 py-0.5 rounded transition-colors max-w-[140px]",
                  hasVendorPart
                    ? "text-cyan-400 hover:bg-cyan-900/30 cursor-copy"
                    : "text-gray-500 hover:bg-gray-800 cursor-copy"
                )}
              >
                {copiedId === (hasVendorPart ? vendorPartNumber : internalPartNumber) ? (
                  <Check className="w-2.5 h-2.5 text-green-400 shrink-0" />
                ) : (
                  <Copy className="w-2.5 h-2.5 shrink-0 opacity-60" />
                )}
                <span className="truncate">{displayNumber}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-black border-gray-700 text-xs max-w-xs">
              <div className="space-y-0.5">
                <div className="text-cyan-300 font-mono">{displayNumber}</div>
                {internalPartNumber && <div className="text-gray-400 text-[10px]">AK: {internalPartNumber}</div>}
                <div className="text-gray-500 text-[10px]">Click to copy</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-0 min-w-0", className)}>
      {/* Vendor Part Number — primary, copyable */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(hasVendorPart ? vendorPartNumber : internalPartNumber, "part number"); }}
              className={cn(
                "flex items-center gap-1 text-[11px] font-mono rounded transition-colors w-fit max-w-[180px]",
                hasVendorPart
                  ? "text-cyan-400 hover:bg-cyan-900/30 cursor-copy"
                  : "text-gray-500 hover:bg-gray-800 cursor-copy"
              )}
            >
              {copiedId === (hasVendorPart ? vendorPartNumber : internalPartNumber) ? (
                <Check className="w-3 h-3 text-green-400 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 shrink-0 opacity-50" />
              )}
              <span className="truncate">{displayNumber}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-black border-gray-700 text-xs">
            {vendorPartNumber || "No vendor part number"} — Click to copy
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Internal AK reference — secondary */}
      {internalPartNumber && internalPartNumber !== vendorPartNumber && (
        <span className="text-[9px] text-gray-500 font-mono truncate max-w-[180px] pl-4">
          AK: {internalPartNumber}
        </span>
      )}
    </div>
  );
}

/**
 * BulkCopyPartNumbers — "Copy All Part Numbers" button for a vendor group.
 */
export function BulkCopyPartNumbers({ items, label = "Copy All Part #s" }) {
  const [copied, setCopied] = React.useState(false);

  const handleBulkCopy = (e) => {
    e.stopPropagation();
    const numbers = items
      .map(item => resolveVendorPartNumber(item) || item.part_name || "")
      .filter(Boolean);

    if (numbers.length === 0) {
      toast.error("No part numbers to copy");
      return;
    }

    const text = [...new Set(numbers)].join("\n");
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${numbers.length} part number(s)`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleBulkCopy}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-cyan-400 transition-colors px-1.5 py-0.5 rounded hover:bg-cyan-900/20"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied!" : label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-black border-gray-700 text-xs">
          Copy all vendor part numbers (newline-separated)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}