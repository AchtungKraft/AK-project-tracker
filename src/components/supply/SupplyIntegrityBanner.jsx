import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * SupplyIntegrityBanner - Shows production gate status and provides fix actions
 * 
 * Displays when supplyProductionGateV2 fails
 * Provides admin-only normalization controls
 */
export default function SupplyIntegrityBanner({ 
  onGateStatusChange,
  showFixControls = true,
  compact = false
}) {
  const [isRunningNormalization, setIsRunningNormalization] = useState(false);
  const [normalizationReport, setNormalizationReport] = useState(null);

  // Check production gate status
  const { data: gateResult, isLoading, refetch } = useQuery({
    queryKey: ['supplyProductionGate'],
    queryFn: async () => {
      const response = await base44.functions.invoke('supplyProductionGateV2', {});
      return response.data;
    },
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Notify parent of gate status changes
  React.useEffect(() => {
    if (gateResult && onGateStatusChange) {
      onGateStatusChange(gateResult.execution_surface_ready);
    }
  }, [gateResult?.execution_surface_ready, onGateStatusChange]);

  const handleDryRun = async () => {
    setIsRunningNormalization(true);
    try {
      const response = await base44.functions.invoke('normalizeSupplyData', { dry_run: true });
      setNormalizationReport(response.data);
      toast.success('Dry run complete - review changes below');
    } catch (error) {
      toast.error(`Dry run failed: ${error.message}`);
    } finally {
      setIsRunningNormalization(false);
    }
  };

  const handleApplyFixes = async () => {
    setIsRunningNormalization(true);
    try {
      const response = await base44.functions.invoke('normalizeSupplyData', { dry_run: false });
      setNormalizationReport(response.data);
      toast.success('Normalization applied successfully');
      // Refresh gate status
      setTimeout(() => refetch(), 1000);
    } catch (error) {
      toast.error(`Normalization failed: ${error.message}`);
    } finally {
      setIsRunningNormalization(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
        <span className="text-sm text-gray-400">Checking supply integrity...</span>
      </div>
    );
  }

  // Gate passed - show success badge if not compact
  if (gateResult?.execution_surface_ready) {
    if (compact) return null;
    
    return (
      <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-400" />
        <span className="text-sm text-green-400">Supply integrity validated</span>
        <Badge variant="outline" className="border-green-600 text-green-400">
          {gateResult.summary?.passing_gates || 0}/{gateResult.summary?.total_gates || 0} gates passing
        </Badge>
      </div>
    );
  }

  // Gate failed - show warning banner
  return (
    <div className="space-y-3">
      <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">Supply Integrity Failing — actions disabled</p>
            <p className="text-sm text-gray-400 mt-1">
              {gateResult?.blocking_gates?.length || 0} blocking gates failed. 
              Run normalization to repair data before continuing.
            </p>
            
            {/* Failed gates list */}
            {gateResult?.gates && (
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(gateResult.gates).filter(([key, gate]) => 
                  typeof gate === 'object' && gate.status === 'FAIL'
                ).map(([key, gate]) => (
                  <Badge 
                    key={key} 
                    variant="outline" 
                    className="border-red-600 text-red-400 text-xs"
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    {key}: {gate.violations_count} issues
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {showFixControls && (
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDryRun}
                disabled={isRunningNormalization}
                className="border-yellow-600 text-yellow-400 hover:bg-yellow-900/20"
              >
                {isRunningNormalization ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 mr-1" />
                )}
                Preview Fix
              </Button>
              <Button
                size="sm"
                onClick={handleApplyFixes}
                disabled={isRunningNormalization}
                className="bg-red-600 hover:bg-red-700"
              >
                {isRunningNormalization ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : null}
                Apply Fix
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Normalization Report */}
      {normalizationReport && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 max-h-64 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white">
              {normalizationReport.dry_run ? 'Dry Run Report' : 'Applied Changes'}
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setNormalizationReport(null)}
              className="text-gray-400 h-6 px-2"
            >
              Dismiss
            </Button>
          </div>
          
          {normalizationReport.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
              <div className="bg-gray-900/50 rounded p-2">
                <p className="text-gray-500">Parts Fixed</p>
                <p className="text-white font-bold">{normalizationReport.summary.parts_fixed || 0}</p>
              </div>
              <div className="bg-gray-900/50 rounded p-2">
                <p className="text-gray-500">Commitments Fixed</p>
                <p className="text-white font-bold">{normalizationReport.summary.commitments_fixed || 0}</p>
              </div>
              <div className="bg-gray-900/50 rounded p-2">
                <p className="text-gray-500">Pools Fixed</p>
                <p className="text-white font-bold">{normalizationReport.summary.pools_fixed || 0}</p>
              </div>
              <div className="bg-gray-900/50 rounded p-2">
                <p className="text-gray-500">Total Changes</p>
                <p className="text-white font-bold">{normalizationReport.summary.total_changes || 0}</p>
              </div>
            </div>
          )}

          {normalizationReport.changes?.length > 0 && (
            <div className="space-y-1 text-xs">
              {normalizationReport.changes.slice(0, 10).map((change, idx) => (
                <div key={idx} className="text-gray-400 font-mono">
                  {change.type}: {change.entity_type} {change.entity_id?.slice(-8)}
                  {change.field && ` - ${change.field}: ${change.old_value} → ${change.new_value}`}
                </div>
              ))}
              {normalizationReport.changes.length > 10 && (
                <p className="text-gray-500">...and {normalizationReport.changes.length - 10} more changes</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}