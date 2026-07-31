import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Check, ExternalLink, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildPublicClientUrl } from "@/lib/clientPortalUrls";
import { cn } from "@/lib/utils";

/**
 * Client Links section with slug selector for the feedback detail page.
 *
 * @param {Array} clientAccessOptions - [{slug, name, contactId}]
 * @param {string} primaryClientSlug - default selected slug
 * @param {string} requestId
 * @param {boolean} compact - mobile layout
 */
export function ClientLinksSection({ clientAccessOptions = [], primaryClientSlug, requestId, compact = false }) {
  const { toast } = useToast();

  // Derive options: use clientAccessOptions if available, fall back to primaryClientSlug
  const options = useMemo(() => {
    if (clientAccessOptions.length > 0) return clientAccessOptions;
    if (primaryClientSlug) return [{ slug: primaryClientSlug, name: primaryClientSlug, contactId: null }];
    return [];
  }, [clientAccessOptions, primaryClientSlug]);

  const [selectedSlug, setSelectedSlug] = useState(() => {
    if (primaryClientSlug && options.some(o => o.slug === primaryClientSlug)) return primaryClientSlug;
    return options[0]?.slug || '';
  });

  // URLs derived from selected slug
  const portalUrl = useMemo(() => buildPublicClientUrl({ type: 'portal', slug: selectedSlug }), [selectedSlug]);
  const requestUrl = useMemo(() => buildPublicClientUrl({ type: 'request', slug: selectedSlug, requestId }), [selectedSlug, requestId]);

  const handleCopy = async (url, label) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ description: `${label} link copied` });
    } catch {
      toast({ variant: "destructive", description: "Failed to copy link" });
    }
  };

  // No slugs available
  if (options.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic">
        No client access slug assigned
      </div>
    );
  }

  const showSelector = options.length > 1;

  // Slug selector component
  const SlugSelector = showSelector ? (
    <Select value={selectedSlug} onValueChange={setSelectedSlug}>
      <SelectTrigger className={cn(
        "bg-gray-800/60 border-gray-700 text-white",
        compact ? "h-7 text-xs w-auto min-w-[140px]" : "h-7 text-xs w-auto min-w-[160px]"
      )}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.slug} value={opt.slug}>
            {opt.name} — {opt.slug}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <span className="text-xs text-gray-400 px-1">{options[0]?.name || selectedSlug}</span>
  );

  // Compact chip layout for mobile
  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Client:</span>
          {SlugSelector}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleCopy(portalUrl, "Client portal")}
            disabled={!portalUrl}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800/60 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors disabled:opacity-40"
          >
            <ExternalLink className="w-3 h-3" />
            Portal
          </button>
          <button
            onClick={() => handleCopy(requestUrl, "Client request")}
            disabled={!requestUrl}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800/60 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors disabled:opacity-40"
          >
            <Link2 className="w-3 h-3" />
            This Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 bg-gray-800/50 rounded-md px-2 py-1.5">
        <Link2 className="w-3 h-3 text-gray-400" />
        <span className="text-xs text-gray-400">Client Links:</span>
      </div>

      {SlugSelector}

      <LinkCopyButton
        url={portalUrl}
        icon={ExternalLink}
        label="Portal"
        toastLabel="Client portal"
      />

      <LinkCopyButton
        url={requestUrl}
        icon={Link2}
        label="This Request"
        toastLabel="Client request"
      />
    </div>
  );
}

/**
 * Internal button with tooltip showing URL and copy on click
 */
function LinkCopyButton({ url, icon: Icon, label, toastLabel }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.preventDefault();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ description: `${toastLabel} link copied` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", description: "Failed to copy link" });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!url}
            className="h-7 text-xs border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white gap-1.5"
          >
            <Icon className="w-3 h-3" />
            {label}
            {copied ? (
              <Check className="w-3 h-3 ml-1 text-green-500" />
            ) : (
              <Copy className="w-3 h-3 ml-1 opacity-60" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <p className="text-xs font-mono break-all">{url || "No link available"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact copy button for list views / cards (e.g. CompactRequestRow)
 */
export function CopyRequestLinkButton({ slug, requestId, size = "icon", className = "" }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const url = buildPublicClientUrl({ type: 'request', slug, requestId });

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!url) {
      toast({ variant: "destructive", description: "No client slug available" });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ description: "Client link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", description: "Failed to copy link" });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            variant="ghost"
            onClick={handleCopy}
            disabled={!url}
            className={`h-7 w-7 ${className}`}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Link2 className="w-3.5 h-3.5 text-gray-400" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">{url ? "Copy client link" : "No client slug"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Legacy exports for backward compatibility
export function getClientPortalUrl(slug) {
  return buildPublicClientUrl({ type: 'portal', slug });
}

export function getClientRequestUrl(slug, requestId) {
  return buildPublicClientUrl({ type: 'request', slug, requestId });
}

export default ClientLinksSection;