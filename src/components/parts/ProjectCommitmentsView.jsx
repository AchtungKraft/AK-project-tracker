import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Search, Package, FileText, ChevronDown, ChevronUp, 
  AlertTriangle, CheckCircle2, Truck, Clock 
} from "lucide-react";
import CommitmentCard from "./CommitmentCard";
import { useCommitmentData } from "../inventory/useCommitmentData";
import FinancialStatusBadge from "../financial/FinancialStatusBadge";
import { useFinancialStatusBatch } from "../financial/useFinancialStatus";

/**
 * ProjectCommitmentsView - Shows all commitments for a project
 * Provides commitment-centric view alongside legacy requirement view
 */
export default function ProjectCommitmentsView({ projectId }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState(new Set(['active']));

  const { data: commitments = [], isLoading } = useQuery({
    queryKey: ['partCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements', projectId],
    queryFn: () => base44.entities.PartProjectRequirement.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list(),
  });

  // Use dual-read hook for metrics
  const metrics = useCommitmentData({
    commitments,
    requirements,
    lineItems,
    projectId,
  });

  // Batch resolve financial status for all commitments
  const financialContexts = useMemo(() => {
    return commitments.map(c => ({
      part_id: c.part_id,
      project_id: projectId,
      commitment_id: c.id,
    }));
  }, [commitments, projectId]);
  
  const { data: financialStatuses = [] } = useFinancialStatusBatch(financialContexts, {
    enabled: commitments.length > 0,
  });
  
  const financialStatusMap = useMemo(() => {
    const map = new Map();
    financialStatuses.forEach(fs => {
      map.set(fs.commitment_id, fs);
    });
    return map;
  }, [financialStatuses]);

  const cancelMutation = useMutation({
    mutationFn: async (commitment) => {
      return base44.entities.PartCommitment.update(commitment.id, {
        commitment_status: 'cancelled',
        qty_cancelled: commitment.qty_committed,
        notes: `${commitment.notes || ''}\nCancelled on ${new Date().toISOString()}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCommitments', projectId] });
      toast.success('Commitment cancelled');
    },
  });

  const getPartInfo = (partId) => parts.find(p => p.id === partId);

  // Filter and group commitments
  const filteredCommitments = useMemo(() => {
    return commitments.filter(c => {
      const part = getPartInfo(c.part_id);
      const matchesSearch = !searchTerm || 
        part?.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part?.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.commitment_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [commitments, searchTerm, statusFilter, parts]);

  const groupedCommitments = useMemo(() => {
    const active = filteredCommitments.filter(c => 
      !['cancelled', 'closed', 'installed'].includes(c.commitment_status)
    );
    const completed = filteredCommitments.filter(c => 
      c.commitment_status === 'installed'
    );
    const cancelled = filteredCommitments.filter(c => 
      c.commitment_status === 'cancelled' || c.commitment_status === 'closed'
    );
    
    return { active, completed, cancelled };
  }, [filteredCommitments]);

  const toggleGroup = (group) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  if (!projectId) {
    return <div className="text-gray-500 p-4">No project selected</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-black/40 backdrop-blur-xl border border-purple-900/30">
        <CardHeader className="border-b border-purple-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-400" />
              <CardTitle className="text-white text-base">Commitments</CardTitle>
              <Badge variant="outline" className="border-purple-600 text-purple-400">
                {metrics.source === 'commitments' ? 'Active' : 'Legacy Mode'}
              </Badge>
            </div>
            {commitments.length === 0 && requirements.length > 0 && (
              <Badge variant="outline" className="border-yellow-600 text-yellow-400">
                <AlertTriangle className="w-3 h-3 mr-1" />
                No commitments - using legacy data
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-400">Total Needed</p>
              <p className="text-lg font-bold text-white">{metrics.totalNeeded}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-purple-900/30">
              <p className="text-xs text-gray-400">Ordered</p>
              <p className="text-lg font-bold text-purple-400">{metrics.totalOrdered}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-blue-900/30">
              <p className="text-xs text-gray-400">Allocated</p>
              <p className="text-lg font-bold text-blue-400">{metrics.totalAllocated}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-green-900/30">
              <p className="text-xs text-gray-400">Installed</p>
              <p className="text-lg font-bold text-green-400">{metrics.totalInstalled}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-orange-900/30">
              <p className="text-xs text-gray-400">On Order</p>
              <p className="text-lg font-bold text-orange-400">{metrics.onOrder}</p>
            </div>
            <div className="p-2 bg-gray-900/50 rounded-lg border border-red-900/30">
              <p className="text-xs text-gray-400">Need to Order</p>
              <p className="text-lg font-bold text-red-400">{metrics.needToOrder}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-gray-900/50 border-gray-700">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="partially_received">Partial Recv</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="allocated">Allocated</SelectItem>
                <SelectItem value="installed">Installed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading commitments...</div>
      ) : commitments.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
          <CardContent className="p-8 text-center">
            <Clock className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 mb-2">No commitments for this project</p>
            <p className="text-xs text-gray-500">
              Commitments will be created when ordering or allocating parts.
              {requirements.length > 0 && ' Currently using legacy requirement data.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Active Commitments */}
          {groupedCommitments.active.length > 0 && (
            <Card className="bg-black/40 backdrop-blur-xl border border-blue-900/30">
              <CardHeader 
                className="p-3 cursor-pointer hover:bg-blue-950/20"
                onClick={() => toggleGroup('active')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {expandedGroups.has('active') ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    <Truck className="w-4 h-4 text-blue-400" />
                    <span className="text-white font-medium">Active</span>
                    <Badge variant="outline" className="border-blue-600 text-blue-400">
                      {groupedCommitments.active.length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {expandedGroups.has('active') && (
                <CardContent className="p-3 pt-0 space-y-2">
                  {groupedCommitments.active.map(c => (
                    <CommitmentCard
                      key={c.id}
                      commitment={c}
                      part={getPartInfo(c.part_id)}
                      orders={orders}
                      onCancel={() => cancelMutation.mutate(c)}
                      financialStatus={financialStatusMap.get(c.id)}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Completed (Installed) */}
          {groupedCommitments.completed.length > 0 && (
            <Card className="bg-black/40 backdrop-blur-xl border border-green-900/30">
              <CardHeader 
                className="p-3 cursor-pointer hover:bg-green-950/20"
                onClick={() => toggleGroup('completed')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {expandedGroups.has('completed') ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-white font-medium">Installed</span>
                    <Badge variant="outline" className="border-green-600 text-green-400">
                      {groupedCommitments.completed.length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {expandedGroups.has('completed') && (
                <CardContent className="p-3 pt-0 space-y-2">
                  {groupedCommitments.completed.map(c => (
                    <CommitmentCard
                      key={c.id}
                      commitment={c}
                      part={getPartInfo(c.part_id)}
                      compact
                      financialStatus={financialStatusMap.get(c.id)}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Cancelled */}
          {groupedCommitments.cancelled.length > 0 && (
            <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
              <CardHeader 
                className="p-3 cursor-pointer hover:bg-gray-900/50"
                onClick={() => toggleGroup('cancelled')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {expandedGroups.has('cancelled') ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    <AlertTriangle className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-400 font-medium">Cancelled/Closed</span>
                    <Badge variant="outline" className="border-gray-600 text-gray-500">
                      {groupedCommitments.cancelled.length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {expandedGroups.has('cancelled') && (
                <CardContent className="p-3 pt-0 space-y-2">
                  {groupedCommitments.cancelled.map(c => (
                    <CommitmentCard
                      key={c.id}
                      commitment={c}
                      part={getPartInfo(c.part_id)}
                      compact
                      financialStatus={financialStatusMap.get(c.id)}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}