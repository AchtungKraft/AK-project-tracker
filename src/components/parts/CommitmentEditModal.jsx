import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package, XCircle, GitBranch, Clock, AlertTriangle
} from "lucide-react";
import CancelCommitmentModal from "./CancelCommitmentModal";
import SplitCommitmentModal from "./SplitCommitmentModal";
import CommitmentHistoryDrawer from "./CommitmentHistoryDrawer";
import CommitmentStatusBadge from "./CommitmentStatusBadge";

/**
 * CommitmentEditModal - Main modal for editing/managing a commitment
 * 
 * Actions:
 * - View details
 * - Cancel commitment
 * - Split commitment
 * - View history
 */
export default function CommitmentEditModal({ 
  commitment, 
  onClose 
}) {
  const [showCancel, setShowCancel] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch part and project
  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const part = parts.find(p => p.id === commitment.part_id);
  const project = projects.find(p => p.id === commitment.project_id);

  // Determine what actions are available
  const canCancel = (commitment.qty_installed || 0) === 0;
  const canReduce = (commitment.qty_installed || 0) > 0;
  const canSplit = (commitment.qty_committed || 0) - (commitment.qty_installed || 0) > 1;
  const isCancelled = commitment.commitment_status === 'cancelled';
  const isClosed = commitment.commitment_status === 'closed';

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Package className="w-5 h-5 text-gray-400" />
              Commitment Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Part/Project Header */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white">{part?.part_name}</h3>
                  {part?.vendor_part_number && (
                    <p className="text-sm text-gray-500 font-mono">{part.vendor_part_number}</p>
                  )}
                  <p className="text-sm text-gray-400 mt-1">Project: {project?.name}</p>
                </div>
                <CommitmentStatusBadge status={commitment.commitment_status} />
              </div>
            </div>

            {/* Quantities Grid */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <p className="text-xs text-gray-400">Committed</p>
                <p className="text-xl font-bold text-white">{commitment.qty_committed || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <p className="text-xs text-gray-400">Ordered</p>
                <p className="text-xl font-bold text-purple-400">{commitment.qty_ordered || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <p className="text-xs text-gray-400">Received</p>
                <p className="text-xl font-bold text-cyan-400">{commitment.qty_received || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <p className="text-xs text-gray-400">Allocated</p>
                <p className="text-xl font-bold text-blue-400">{commitment.qty_allocated || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <p className="text-xs text-gray-400">Installed</p>
                <p className="text-xl font-bold text-green-400">{commitment.qty_installed || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-3 text-center">
                <p className="text-xs text-gray-400">Cancelled</p>
                <p className="text-xl font-bold text-red-400">{commitment.qty_cancelled || 0}</p>
              </div>
            </div>

            {/* Source Info */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Source:</span>
                <Badge variant="outline" className="border-gray-600 text-gray-300">
                  {commitment.source_type || 'requirement'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Version:</span>
                <span className="text-gray-300">{commitment.commitment_version || 1}</span>
              </div>
              {commitment.parent_commitment_id && (
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-400" />
                  <span className="text-purple-400">Split from parent</span>
                </div>
              )}
            </div>

            {/* Integrity Warning */}
            {commitment.integrity_warning && (
              <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-yellow-400 font-medium">Integrity Warning</p>
                  <p className="text-gray-400">{commitment.integrity_warning_details}</p>
                </div>
              </div>
            )}

            {/* Cancellation Info */}
            {isCancelled && commitment.cancelled_at && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                <p className="text-sm text-red-400">
                  Cancelled on {new Date(commitment.cancelled_at).toLocaleDateString()}
                  {commitment.cancelled_by && ` by ${commitment.cancelled_by}`}
                </p>
                {commitment.cancelled_reason && (
                  <p className="text-sm text-gray-400 mt-1">Reason: {commitment.cancelled_reason}</p>
                )}
              </div>
            )}

            {/* Actions */}
            {!isCancelled && !isClosed && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700">
                <Button 
                  variant="outline" 
                  onClick={() => setShowHistory(true)}
                  className="border-gray-600 gap-2"
                >
                  <Clock className="w-4 h-4" />
                  View History
                </Button>
                
                {canSplit && (
                  <Button 
                    variant="outline" 
                    onClick={() => setShowSplit(true)}
                    className="border-purple-600 text-purple-400 hover:bg-purple-900/30 gap-2"
                  >
                    <GitBranch className="w-4 h-4" />
                    Split
                  </Button>
                )}
                
                <Button 
                  variant="outline" 
                  onClick={() => setShowCancel(true)}
                  className="border-red-600 text-red-400 hover:bg-red-900/30 gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  {canCancel ? 'Cancel' : 'Reduce'}
                </Button>
              </div>
            )}

            {/* Closed/Cancelled state */}
            {(isCancelled || isClosed) && (
              <div className="flex gap-2 pt-2 border-t border-gray-700">
                <Button 
                  variant="outline" 
                  onClick={() => setShowHistory(true)}
                  className="border-gray-600 gap-2"
                >
                  <Clock className="w-4 h-4" />
                  View History
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-modals */}
      {showCancel && (
        <CancelCommitmentModal
          commitment={commitment}
          part={part}
          project={project}
          onClose={() => setShowCancel(false)}
        />
      )}

      {showSplit && (
        <SplitCommitmentModal
          commitment={commitment}
          part={part}
          currentProject={project}
          onClose={() => setShowSplit(false)}
        />
      )}

      {showHistory && (
        <CommitmentHistoryDrawer
          commitment={commitment}
          part={part}
          project={project}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}