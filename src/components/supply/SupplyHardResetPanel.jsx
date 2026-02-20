import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, Trash2, Eye, Loader2, ShieldAlert, CheckCircle2, XCircle,
  ArrowRight, Package, FolderKanban
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const CONFIRM_TOKEN = 'RESET_SUPPLY_COMMITMENTS_DELETE_ALL';

/**
 * SupplyHardResetPanel - Admin-only danger zone for hard resetting supply data
 */
export default function SupplyHardResetPanel() {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isExecuteLoading, setIsExecuteLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [executeResult, setExecuteResult] = useState(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState(null);

  const handlePreview = async () => {
    setIsPreviewLoading(true);
    setError(null);
    setExecuteResult(null);
    try {
      const response = await base44.functions.invoke('hardResetSupplyCommitments', {
        mode: 'PREVIEW'
      });
      setPreviewData(response.data);
    } catch (e) {
      setError(e.message || 'Failed to generate preview');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (confirmInput !== CONFIRM_TOKEN) {
      setError(`Confirmation token must be exactly: ${CONFIRM_TOKEN}`);
      return;
    }
    
    setIsExecuteLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('hardResetSupplyCommitments', {
        mode: 'EXECUTE',
        confirm: confirmInput
      });
      setExecuteResult(response.data);
      setPreviewData(null);
      setConfirmInput('');
    } catch (e) {
      setError(e.message || 'Failed to execute reset');
    } finally {
      setIsExecuteLoading(false);
    }
  };

  const isConfirmValid = confirmInput === CONFIRM_TOKEN;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="bg-red-950/20 border-red-900/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-red-950/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-red-500" />
                <div>
                  <CardTitle className="text-red-400">Danger Zone: Supply Hard Reset</CardTitle>
                  <CardDescription className="text-red-300/60">
                    Permanently delete all commitments and linked data
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="border-red-600 text-red-400">
                Admin Only
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t border-red-900/30 pt-4">
            {/* Warning Banner */}
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-200">
                  <p className="font-semibold mb-2">This action is IRREVERSIBLE</p>
                  <ul className="list-disc list-inside space-y-1 text-red-300/80">
                    <li>Deletes ALL PartCommitment records</li>
                    <li>Deletes ALL linked LifecycleEvent records</li>
                    <li>Deletes ALL linked PoolAllocation records</li>
                    <li>Preserves Parts, Projects, Vendors, physical_stock</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-900/50 border border-red-600 rounded-lg p-3 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-200 text-sm">{error}</span>
              </div>
            )}

            {/* Preview Button */}
            {!previewData && !executeResult && (
              <Button
                onClick={handlePreview}
                disabled={isPreviewLoading}
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-950/50 gap-2"
              >
                {isPreviewLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                Preview Reset
              </Button>
            )}

            {/* Preview Results */}
            {previewData && !executeResult && (
              <div className="space-y-4">
                <div className="bg-gray-900/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold text-white flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-400" />
                    Preview Summary
                  </h4>
                  
                  {/* Counts Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 rounded p-2 text-center">
                      <p className="text-xs text-gray-500">Commitments</p>
                      <p className="text-xl font-bold text-white">
                        {previewData.summary?.total_commitments || 0}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded p-2 text-center">
                      <p className="text-xs text-gray-500">Lifecycle Events</p>
                      <p className="text-xl font-bold text-purple-400">
                        {previewData.linked_deletes?.lifecycle_events || 0}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded p-2 text-center">
                      <p className="text-xs text-gray-500">Pool Allocations</p>
                      <p className="text-xl font-bold text-blue-400">
                        {previewData.linked_deletes?.allocations?.PoolAllocation || 0}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded p-2 text-center">
                      <p className="text-xs text-gray-500">Distinct Projects</p>
                      <p className="text-xl font-bold text-green-400">
                        {previewData.summary?.distinct_project_count || 0}
                      </p>
                    </div>
                  </div>

                  {/* Status Breakdown */}
                  {previewData.summary?.by_status && Object.keys(previewData.summary.by_status).length > 0 && (
                    <div className="bg-gray-800/30 rounded p-3">
                      <p className="text-xs text-gray-500 mb-2">By Status:</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(previewData.summary.by_status).map(([status, count]) => (
                          <Badge key={status} variant="outline" className="border-gray-600">
                            {status}: {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* High Risk Samples */}
                  {previewData.sample_high_risk?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">
                        High-Risk Items ({previewData.sample_high_risk.length} shown):
                      </p>
                      <div className="max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-gray-700">
                              <TableHead className="text-gray-400">ID</TableHead>
                              <TableHead className="text-gray-400">Required</TableHead>
                              <TableHead className="text-gray-400">Reserved</TableHead>
                              <TableHead className="text-gray-400">Covered</TableHead>
                              <TableHead className="text-gray-400">Installed</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewData.sample_high_risk.map((item) => (
                              <TableRow key={item.id} className="border-gray-800">
                                <TableCell className="font-mono text-xs text-gray-400">
                                  {item.id.slice(-8)}
                                </TableCell>
                                <TableCell className="text-white">{item.required_total}</TableCell>
                                <TableCell className="text-blue-400">{item.reserved_from_stock}</TableCell>
                                <TableCell className="text-purple-400">{item.covered_from_po}</TableCell>
                                <TableCell className="text-green-400">{item.qty_installed}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirmation Input */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">
                      Type <code className="bg-red-900/50 px-1 rounded text-red-300">{CONFIRM_TOKEN}</code> to confirm:
                    </label>
                    <Input
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      placeholder="Type confirmation token..."
                      className="bg-gray-900 border-gray-700 text-white font-mono"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleExecute}
                      disabled={!isConfirmValid || isExecuteLoading}
                      className="bg-red-600 hover:bg-red-700 text-white gap-2"
                    >
                      {isExecuteLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Execute Reset
                    </Button>
                    <Button
                      onClick={() => {
                        setPreviewData(null);
                        setConfirmInput('');
                        setError(null);
                      }}
                      variant="outline"
                      className="border-gray-700 text-gray-300"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Execute Results */}
            {executeResult && (
              <div className="space-y-4">
                <div className={`rounded-lg p-4 ${executeResult.ok ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {executeResult.ok ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <h4 className={`font-semibold ${executeResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {executeResult.ok ? 'Reset Complete' : 'Reset Failed'}
                    </h4>
                  </div>

                  {/* Deleted Counts */}
                  {executeResult.deleted && (
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-gray-900/50 rounded p-2 text-center">
                        <p className="text-xs text-gray-500">Commitments Deleted</p>
                        <p className="text-xl font-bold text-red-400">
                          {executeResult.deleted.commitments}
                        </p>
                      </div>
                      <div className="bg-gray-900/50 rounded p-2 text-center">
                        <p className="text-xs text-gray-500">Events Deleted</p>
                        <p className="text-xl font-bold text-purple-400">
                          {executeResult.deleted.lifecycle_events}
                        </p>
                      </div>
                      <div className="bg-gray-900/50 rounded p-2 text-center">
                        <p className="text-xs text-gray-500">Allocations Deleted</p>
                        <p className="text-xl font-bold text-blue-400">
                          {executeResult.deleted.allocations?.PoolAllocation || 0}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Failures */}
                  {executeResult.failures?.length > 0 && (
                    <div className="bg-red-900/30 rounded p-3 mb-4">
                      <p className="text-red-300 text-sm font-medium mb-2">
                        Failures ({executeResult.failures.length}):
                      </p>
                      <ul className="text-xs text-red-300/80 space-y-1">
                        {executeResult.failures.slice(0, 5).map((f, i) => (
                          <li key={i}>{f.type} {f.id}: {f.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Post Checks */}
                  {executeResult.post_checks && (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-400 font-medium">Post-Reset Validation:</p>
                      
                      {/* Integrity Audit */}
                      <div className="flex items-center gap-2 text-sm">
                        {executeResult.post_checks.integrity_audit?.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-yellow-400" />
                        )}
                        <span className="text-gray-300">
                          Integrity Audit: {executeResult.post_checks.integrity_audit?.ok ? 'Passed' : 'Issues Found'}
                        </span>
                        {executeResult.post_checks.integrity_audit?.critical_issues?.length > 0 && (
                          <Badge variant="outline" className="border-yellow-600 text-yellow-400">
                            {executeResult.post_checks.integrity_audit.critical_issues.length} critical
                          </Badge>
                        )}
                      </div>

                      {/* Canonical Flow */}
                      <div className="flex items-center gap-2 text-sm">
                        {executeResult.post_checks.canonical_flow?.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-yellow-400" />
                        )}
                        <span className="text-gray-300">
                          Canonical Flow: {executeResult.post_checks.canonical_flow?.total_passed || 0} passed, {executeResult.post_checks.canonical_flow?.total_failed || 0} failed
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Next Steps */}
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <h4 className="font-semibold text-white mb-3">Next Steps</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => navigate(createPageUrl('ProjectSupplyManager'))}
                      variant="outline"
                      className="border-green-700 text-green-400 gap-2"
                    >
                      <FolderKanban className="w-4 h-4" />
                      Add Parts to Projects
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => navigate(createPageUrl('GlobalNeedToOrder'))}
                      variant="outline"
                      className="border-purple-700 text-purple-400 gap-2"
                    >
                      <Package className="w-4 h-4" />
                      Order Queue (Empty)
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => {
                        setExecuteResult(null);
                        setPreviewData(null);
                      }}
                      variant="ghost"
                      className="text-gray-400"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}