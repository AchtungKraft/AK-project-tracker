import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Clock, Package, Truck, Wrench, XCircle, GitBranch, 
  Link2, AlertTriangle, CheckCircle2, FileText 
} from "lucide-react";
import { format } from "date-fns";

const ACTION_CONFIG = {
  create: { icon: Package, color: 'text-green-400', label: 'Created' },
  update: { icon: FileText, color: 'text-blue-400', label: 'Updated' },
  delete: { icon: XCircle, color: 'text-red-400', label: 'Deleted' },
  status_change: { icon: CheckCircle2, color: 'text-purple-400', label: 'Status Changed' },
  qty_change: { icon: Package, color: 'text-cyan-400', label: 'Quantity Changed' },
  validation_error: { icon: AlertTriangle, color: 'text-yellow-400', label: 'Validation Error' },
  version_conflict: { icon: AlertTriangle, color: 'text-red-400', label: 'Version Conflict' },
};

const TRIGGER_CONFIG = {
  receiving: { icon: Truck, label: 'Receiving' },
  install: { icon: Wrench, label: 'Installation' },
  allocation: { icon: Package, label: 'Allocation' },
  manual: { icon: FileText, label: 'Manual' },
  migration: { icon: GitBranch, label: 'Migration' },
  sync: { icon: Link2, label: 'Sync' },
  cancel: { icon: XCircle, label: 'Cancellation' },
};

function AuditLogEntry({ log }) {
  const actionConfig = ACTION_CONFIG[log.action_type] || ACTION_CONFIG.update;
  const triggerConfig = TRIGGER_CONFIG[log.trigger_source] || TRIGGER_CONFIG.manual;
  const ActionIcon = actionConfig.icon;
  const TriggerIcon = triggerConfig.icon;

  return (
    <div className="border-l-2 border-gray-700 pl-4 pb-4 relative">
      {/* Timeline dot */}
      <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-gray-600" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ActionIcon className={`w-4 h-4 ${actionConfig.color}`} />
          <span className={`text-sm font-medium ${actionConfig.color}`}>
            {actionConfig.label}
          </span>
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            <TriggerIcon className="w-3 h-3 mr-1" />
            {triggerConfig.label}
          </Badge>
        </div>
        <span className="text-xs text-gray-500">
          {format(new Date(log.created_date), 'MMM d, HH:mm')}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        {log.triggered_by && (
          <p className="text-gray-400">By: {log.triggered_by}</p>
        )}

        {/* Previous Values */}
        {log.previous_values && Object.keys(log.previous_values).length > 0 && (
          <div className="bg-gray-800/50 rounded p-2">
            <p className="text-xs text-gray-500 mb-1">Previous:</p>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(log.previous_values).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-400">{key}:</span>
                  <span className="text-gray-300">{JSON.stringify(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Values */}
        {log.new_values && Object.keys(log.new_values).length > 0 && (
          <div className="bg-gray-800/50 rounded p-2">
            <p className="text-xs text-gray-500 mb-1">New:</p>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(log.new_values).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-400">{key}:</span>
                  <span className="text-green-400">{JSON.stringify(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {log.validation_errors && log.validation_errors.length > 0 && (
          <div className="bg-red-900/30 border border-red-700/50 rounded p-2">
            <p className="text-xs text-red-400 mb-1">Validation Issues:</p>
            {log.validation_errors.map((err, i) => (
              <p key={i} className="text-xs text-red-300">{err}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CommitmentHistoryDrawer - Display audit logs for a commitment
 */
export default function CommitmentHistoryDrawer({ 
  commitment, 
  part,
  project,
  onClose 
}) {
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['commitmentAuditLogs', commitment.id],
    queryFn: () => base44.entities.CommitmentAuditLog.filter({ 
      commitment_id: commitment.id 
    }),
    enabled: !!commitment.id,
  });

  // Sort by date descending
  const sortedLogs = [...auditLogs].sort((a, b) => 
    new Date(b.created_date) - new Date(a.created_date)
  );

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="bg-gray-900 border-gray-700 text-white w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-white">
            <Clock className="w-5 h-5 text-gray-400" />
            Commitment History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Commitment Info */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-white font-medium">{part?.part_name}</span>
            </div>
            <div className="text-sm text-gray-400">
              Project: {project?.name}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="border-purple-600 text-purple-400">
                {commitment.commitment_status}
              </Badge>
              <span className="text-xs text-gray-500">
                Version {commitment.commitment_version || 1}
              </span>
            </div>
          </div>

          {/* Timeline */}
          <ScrollArea className="h-[calc(100vh-280px)]">
            {isLoading ? (
              <div className="text-center text-gray-500 py-8">Loading history...</div>
            ) : sortedLogs.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No history recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {sortedLogs.map(log => (
                  <AuditLogEntry key={log.id} log={log} />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}