import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CLIENT_PORTAL_BASE_URL = 'https://akclient.base44.app';

/**
 * Get the client portal URL for a project
 */
export function getClientPortalUrl(slug) {
  if (!slug) return null;
  return `${CLIENT_PORTAL_BASE_URL}/ClientProjects?slug=${slug}`;
}

/**
 * Get the direct client feedback request URL
 */
export function getClientRequestUrl(slug, requestId) {
  if (!slug || !requestId) return null;
  return `${CLIENT_PORTAL_BASE_URL}/ClientProjects?slug=${slug}&requestId=${requestId}`;
}

/**
 * Copy button with tooltip feedback
 */
function CopyButton({ url, label, size = "sm", variant = "outline", className = "" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!url) {
      toast.error("No URL available to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            variant={variant}
            onClick={handleCopy}
            disabled={!url}
            className={className}
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            {label && <span className="ml-1">{label}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs font-mono break-all">{url || "No link available"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Client Links section for the feedback detail page
 */
export function ClientLinksSection({ slug, requestId, projectName }) {
  const portalUrl = getClientPortalUrl(slug);
  const requestUrl = getClientRequestUrl(slug, requestId);

  if (!slug) {
    return (
      <div className="text-xs text-gray-500 italic">
        No client slug configured for this project
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 bg-gray-800/50 rounded-md px-2 py-1.5">
        <Link2 className="w-3 h-3 text-gray-400" />
        <span className="text-xs text-gray-400">Client Links:</span>
      </div>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await navigator.clipboard.writeText(portalUrl);
                  toast.success("Portal link copied");
                } catch {
                  toast.error("Failed to copy");
                }
              }}
              className="h-7 text-xs border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white gap-1.5"
            >
              <ExternalLink className="w-3 h-3" />
              Portal
              <Copy className="w-3 h-3 ml-1 opacity-60" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <p className="text-xs font-mono break-all">{portalUrl}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await navigator.clipboard.writeText(requestUrl);
                  toast.success("Request link copied");
                } catch {
                  toast.error("Failed to copy");
                }
              }}
              className="h-7 text-xs border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white gap-1.5"
            >
              <Link2 className="w-3 h-3" />
              This Request
              <Copy className="w-3 h-3 ml-1 opacity-60" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <p className="text-xs font-mono break-all">{requestUrl}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/**
 * Compact copy button for list views / cards
 */
export function CopyRequestLinkButton({ slug, requestId, size = "icon", className = "" }) {
  const [copied, setCopied] = useState(false);
  const url = getClientRequestUrl(slug, requestId);

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!url) {
      toast.error("No client slug available");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Client link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
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

export default ClientLinksSection;