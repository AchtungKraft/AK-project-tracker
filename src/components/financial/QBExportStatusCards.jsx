import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, FileText, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";

/**
 * QBExportStatusCards - Phase 6.2
 * Dashboard cards for QuickBooks export status
 * - Invoices Needing QB Export
 * - QB Export Failed
 */

export function QBNeedsExportCard({ projectId, compact = false }) {
  const { data: invoices = [] } = useQuery({
    queryKey: ['qb-needs-export', projectId],
    queryFn: async () => {
      const filter = { qb_exported: false };
      if (projectId) filter.project_id = projectId;
      const all = await base44.entities.InvoiceBatch.filter(filter);
      // Exclude drafts and voided
      return all.filter(i => i.status !== 'draft' && i.status !== 'voided');
    },
    staleTime: 60000,
  });

  if (invoices.length === 0 && !compact) return null;

  return (
    <Card className={cn(
      "border-yellow-800/50",
      invoices.length > 0 ? "bg-yellow-900/20" : "bg-gray-900/30"
    )}>
      <CardHeader className={compact ? "pb-2 p-3" : "pb-2"}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-yellow-400 flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" />
            {compact ? "QB Export" : "Invoices Needing QB Export"}
          </CardTitle>
          <Badge className={invoices.length > 0 ? "bg-yellow-600 text-white" : "bg-gray-600"}>
            {invoices.length}
          </Badge>
        </div>
      </CardHeader>
      {!compact && invoices.length > 0 && (
        <CardContent className="pt-0">
          <p className="text-xs text-gray-400 mb-3">
            These invoices are ready but haven't been exported to QuickBooks.
          </p>
          
          {/* Show first 3 items */}
          <div className="space-y-2 mb-3">
            {invoices.slice(0, 3).map(invoice => (
              <div 
                key={invoice.id} 
                className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg text-sm"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">
                    {invoice.invoice_number || invoice.batch_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {invoice.status} • ${(invoice.total_amount || 0).toLocaleString()}
                  </p>
                </div>
                <Badge variant="outline" className="border-yellow-600 text-yellow-400 text-xs">
                  Pending
                </Badge>
              </div>
            ))}
          </div>

          {invoices.length > 3 && (
            <p className="text-xs text-gray-500 mb-3">
              +{invoices.length - 3} more invoices
            </p>
          )}

          <Link to={createPageUrl('InvoiceWorkbench')}>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full border-yellow-700 text-yellow-400 hover:bg-yellow-900/30"
            >
              <FileText className="w-3 h-3 mr-1" />
              View All Invoices
            </Button>
          </Link>
        </CardContent>
      )}
    </Card>
  );
}

export function QBExportFailedCard({ projectId, compact = false }) {
  const { data: invoices = [] } = useQuery({
    queryKey: ['qb-export-failed', projectId],
    queryFn: async () => {
      const filter = { qb_sync_status: 'failed' };
      if (projectId) filter.project_id = projectId;
      return base44.entities.InvoiceBatch.filter(filter);
    },
    staleTime: 60000,
  });

  if (invoices.length === 0) return null;

  return (
    <Card className="bg-red-900/20 border-red-800/50">
      <CardHeader className={compact ? "pb-2 p-3" : "pb-2"}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-red-400 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4" />
            {compact ? "QB Failed" : "QB Export Failed"}
          </CardTitle>
          <Badge className="bg-red-600 text-white">
            {invoices.length}
          </Badge>
        </div>
      </CardHeader>
      {!compact && (
        <CardContent className="pt-0">
          <p className="text-xs text-gray-400 mb-3">
            These invoices failed to export to QuickBooks.
          </p>
          
          {/* Show first 3 items */}
          <div className="space-y-2 mb-3">
            {invoices.slice(0, 3).map(invoice => (
              <div 
                key={invoice.id} 
                className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg text-sm"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">
                    {invoice.invoice_number || invoice.batch_name}
                  </p>
                  {invoice.qb_sync_error && (
                    <p className="text-xs text-red-400 truncate">
                      {invoice.qb_sync_error}
                    </p>
                  )}
                </div>
                <Badge className="bg-red-600/30 text-red-400 text-xs">
                  Failed
                </Badge>
              </div>
            ))}
          </div>

          <Link to={createPageUrl('InvoiceWorkbench')}>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full border-red-700 text-red-400 hover:bg-red-900/30"
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              Resolve Failures
            </Button>
          </Link>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Combined QB Status Summary for dashboards
 */
export default function QBExportStatusCards({ projectId }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <QBNeedsExportCard projectId={projectId} />
      <QBExportFailedCard projectId={projectId} />
    </div>
  );
}