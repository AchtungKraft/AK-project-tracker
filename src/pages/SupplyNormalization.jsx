import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, Play, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  ArrowLeft, FileText, Wrench, Database
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";

/**
 * SupplyNormalization - Admin page for running data normalization
 * 
 * Runbook:
 * 1. Run normalizeSupplyData with dry_run=true
 * 2. Review report
 * 3. Run normalizeSupplyData with dry_run=false
 * 4. Run supplyIntegrityAudit to verify
 * 5. Run supplyProductionGateV2 to confirm PASS
 */
export default function SupplyNormalization() {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  
  const [dryRunReport, setDryRunReport] = useState(null);
  const [applyReport, setApplyReport] = useState(null);
  const [auditReport, setAuditReport] = useState(null);
  const [gateReport, setGateReport] = useState(null);

  const runStep = async (stepName, fn) => {
    setCurrentStep(stepName);
    setIsRunning(true);
    try {
      const result = await fn();
      return result;
    } catch (error) {
      toast.error(`${stepName} failed: ${error.message}`);
      throw error;
    } finally {
      setIsRunning(false);
      setCurrentStep(null);
    }
  };

  const handleDryRun = async () => {
    const result = await runStep('Dry Run', async () => {
      const response = await base44.functions.invoke('normalizeSupplyData', { dry_run: true });
      setDryRunReport(response.data);
      toast.success('Dry run complete');
      return response.data;
    });
  };

  const handleApply = async () => {
    const result = await runStep('Apply Normalization', async () => {
      const response = await base44.functions.invoke('normalizeSupplyData', { dry_run: false });
      setApplyReport(response.data);
      toast.success('Normalization applied');
      return response.data;
    });
  };

  const handleAudit = async () => {
    const result = await runStep('Integrity Audit', async () => {
      const response = await base44.functions.invoke('supplyIntegrityAudit', {});
      setAuditReport(response.data);
      toast.success('Audit complete');
      return response.data;
    });
  };

  const handleGateCheck = async () => {
    const result = await runStep('Production Gate', async () => {
      const response = await base44.functions.invoke('supplyProductionGateV2', {});
      setGateReport(response.data);
      if (response.data?.execution_surface_ready) {
        toast.success('Production gate PASSED');
      } else {
        toast.warning('Production gate FAILED - more fixes needed');
      }
      return response.data;
    });
  };

  const handleFullRunbook = async () => {
    try {
      await handleDryRun();
      await handleApply();
      await handleAudit();
      await handleGateCheck();
      toast.success('Full runbook complete');
    } catch (error) {
      // Error already shown
    }
  };

  const renderReport = (title, report, type) => {
    if (!report) return null;

    return (
      <Card className="bg-black/40 border-gray-800">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-white text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 max-h-64 overflow-auto">
          {type === 'normalization' && report.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
              <div className="bg-gray-800/50 rounded p-2">
                <p className="text-gray-500">Parts</p>
                <p className="text-white font-bold">{report.summary.parts_fixed || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-2">
                <p className="text-gray-500">Commitments</p>
                <p className="text-white font-bold">{report.summary.commitments_fixed || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-2">
                <p className="text-gray-500">Pools</p>
                <p className="text-white font-bold">{report.summary.pools_fixed || 0}</p>
              </div>
              <div className="bg-gray-800/50 rounded p-2">
                <p className="text-gray-500">Total</p>
                <p className="text-white font-bold">{report.summary.total_changes || 0}</p>
              </div>
            </div>
          )}

          {type === 'audit' && report.audit && (
            <div className="space-y-2">
              {Object.entries(report.audit).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">{key}</span>
                  <Badge 
                    variant="outline" 
                    className={value.status === 'PASS' 
                      ? 'border-green-600 text-green-400' 
                      : 'border-red-600 text-red-400'
                    }
                  >
                    {value.status === 'PASS' ? (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    ) : (
                      <XCircle className="w-3 h-3 mr-1" />
                    )}
                    {value.status} ({value.violations?.length || 0})
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {type === 'gate' && report.gates && (
            <div className="space-y-2">
              {Object.entries(report.gates).filter(([k]) => k !== 'timestamp').map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">{key}</span>
                  <Badge 
                    variant="outline" 
                    className={value.status === 'PASS' 
                      ? 'border-green-600 text-green-400' 
                      : 'border-red-600 text-red-400'
                    }
                  >
                    {value.status === 'PASS' ? (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    ) : (
                      <XCircle className="w-3 h-3 mr-1" />
                    )}
                    {value.status} ({value.violations_count || 0})
                  </Badge>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-700 flex items-center justify-between">
                <span className="text-white font-medium">Execution Ready</span>
                <Badge 
                  className={report.execution_surface_ready 
                    ? 'bg-green-600' 
                    : 'bg-red-600'
                  }
                >
                  {report.execution_surface_ready ? 'YES' : 'NO'}
                </Badge>
              </div>
            </div>
          )}

          {report.changes?.length > 0 && (
            <div className="mt-3 space-y-1 text-xs font-mono">
              {report.changes.slice(0, 15).map((change, idx) => (
                <div key={idx} className="text-gray-500">
                  {change.type}: {change.entity_type} {change.entity_id?.slice(-8)}
                  {change.field && ` - ${change.field}`}
                </div>
              ))}
              {report.changes.length > 15 && (
                <p className="text-gray-600">...and {report.changes.length - 15} more</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl('SupplyLanding'))}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Supply Data Normalization</h1>
              <p className="text-sm text-gray-400">Admin tool for repairing supply chain data</p>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-400 font-medium">Admin Only</p>
                <p className="text-sm text-gray-400 mt-1">
                  This tool modifies data across parts, commitments, and pools. 
                  Always run a dry run first and review changes before applying.
                </p>
              </div>
            </div>
          </div>

          {/* Runbook Steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Dry Run */}
            <Card className="bg-black/40 border-gray-800">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Step 1: Dry Run
                </CardTitle>
                <CardDescription>Preview changes without applying</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Button
                  onClick={handleDryRun}
                  disabled={isRunning}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {currentStep === 'Dry Run' ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Run Dry Run
                </Button>
                {dryRunReport && (
                  <Badge className="mt-2 bg-blue-600">
                    {dryRunReport.summary?.total_changes || 0} changes previewed
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Apply */}
            <Card className="bg-black/40 border-gray-800">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-white flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-green-400" />
                  Step 2: Apply
                </CardTitle>
                <CardDescription>Apply normalization fixes</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Button
                  onClick={handleApply}
                  disabled={isRunning}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {currentStep === 'Apply Normalization' ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Apply Fixes
                </Button>
                {applyReport && (
                  <Badge className="mt-2 bg-green-600">
                    {applyReport.summary?.total_changes || 0} changes applied
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* Step 3: Audit */}
            <Card className="bg-black/40 border-gray-800">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-400" />
                  Step 3: Integrity Audit
                </CardTitle>
                <CardDescription>Validate data integrity</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Button
                  onClick={handleAudit}
                  disabled={isRunning}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {currentStep === 'Integrity Audit' ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Run Audit
                </Button>
                {auditReport && (
                  <Badge className={`mt-2 ${auditReport.success ? 'bg-green-600' : 'bg-red-600'}`}>
                    {auditReport.success ? 'All checks passed' : 'Issues found'}
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* Step 4: Gate Check */}
            <Card className="bg-black/40 border-gray-800">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" />
                  Step 4: Production Gate
                </CardTitle>
                <CardDescription>Verify system is ready</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Button
                  onClick={handleGateCheck}
                  disabled={isRunning}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  {currentStep === 'Production Gate' ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Check Gate
                </Button>
                {gateReport && (
                  <Badge className={`mt-2 ${gateReport.execution_surface_ready ? 'bg-green-600' : 'bg-red-600'}`}>
                    {gateReport.execution_surface_ready ? 'PASS' : 'FAIL'}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Full Runbook Button */}
          <Card className="bg-black/40 border-red-900/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Run Full Runbook</p>
                  <p className="text-sm text-gray-400">Execute all steps in sequence</p>
                </div>
                <Button
                  onClick={handleFullRunbook}
                  disabled={isRunning}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isRunning ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Run All Steps
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Reports */}
          <div className="space-y-4">
            {renderReport('Dry Run Report', dryRunReport, 'normalization')}
            {renderReport('Applied Changes', applyReport, 'normalization')}
            {renderReport('Integrity Audit', auditReport, 'audit')}
            {renderReport('Production Gate', gateReport, 'gate')}
          </div>
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}