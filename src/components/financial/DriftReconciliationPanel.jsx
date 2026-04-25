import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Shield,
  ArrowRight,
  Eye,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(n) {
  return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DriftReconciliationPanel() {
  const [applyResult, setApplyResult] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["financialDrift"],
    queryFn: async () => {
      const res = await base44.functions.invoke("analyzeFinancialDrift", { mode: "preview" });
      return res.data;
    },
    staleTime: 30000,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("analyzeFinancialDrift", { mode: "apply" });
      return res.data;
    },
    onSuccess: (result) => {
      setApplyResult(result);
      queryClient.invalidateQueries({ queryKey: ["financialDrift"] });
    },
  });

  const hasDrift = data?.projects_with_drift > 0;
  const totalDelta = data?.total_delta || 0;

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
      <CardHeader className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <CardTitle className="text-white text-lg">Financial Drift Reconciliation</CardTitle>
            {hasDrift ? (
              <Badge className="bg-yellow-600 text-white">Drift Detected</Badge>
            ) : (
              <Badge className="bg-green-600 text-white">Clean</Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setApplyResult(null); refetch(); }}
            disabled={isFetching}
            className="border-gray-700 gap-2"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Scan
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            <span className="text-gray-400">Scanning all projects for drift...</span>
          </div>
        ) : !hasDrift && !applyResult ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="text-green-400 font-medium">No Financial Drift Detected</p>
            <p className="text-gray-500 text-sm mt-1">
              All commitment invoiced amounts match invoice line totals
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            {hasDrift && !applyResult && (
              <DriftSummary data={data} />
            )}

            {/* Project Details */}
            {hasDrift && !applyResult && data.projects.map(p => (
              <ProjectDriftDetail key={p.project_id} project={p} />
            ))}

            {/* Action Bar */}
            {hasDrift && !applyResult && (
              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-yellow-600/30">
                <div>
                  <p className="text-white font-medium">Ready to Reconcile</p>
                  <p className="text-gray-400 text-sm">
                    This will update {data.total_drift_commitments} commitment(s)
                    {data.projects.some(p => p.orphan_linked_lines.length > 0) &&
                      ` + ${data.projects.reduce((s, p) => s + p.orphan_linked_lines.length, 0)} orphan-linked commitment(s)`
                    } to match invoice line totals. Invoice data is never modified.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-gray-700 gap-2"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    <Eye className="w-4 h-4" />
                    Preview Fix
                  </Button>
                  <Button
                    onClick={() => applyMutation.mutate()}
                    disabled={applyMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white gap-2"
                  >
                    {applyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    Apply Fix
                  </Button>
                </div>
              </div>
            )}

            {/* Apply Result */}
            {applyResult && (
              <ApplyResult result={applyResult} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DriftSummary({ data }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Projects with Drift</p>
        <p className="text-2xl font-bold text-yellow-400">{data.projects_with_drift}</p>
      </div>
      <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Commitment Mismatches</p>
        <p className="text-2xl font-bold text-white">{data.total_drift_commitments}</p>
      </div>
      <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Total Delta</p>
        <p className={cn(
          "text-2xl font-bold",
          data.total_delta > 0 ? "text-yellow-400" : "text-red-400"
        )}>
          {fmt(data.total_delta)}
        </p>
      </div>
    </div>
  );
}

function ProjectDriftDetail({ project }) {
  const hasDrifts = project.drifts.length > 0;
  const hasOrphans = project.orphan_linked_lines.length > 0;

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <div className="p-3 bg-gray-900/50 flex items-center justify-between">
        <div>
          <p className="text-white font-medium text-sm">Project: {project.project_id.slice(0, 12)}...</p>
          <p className="text-gray-400 text-xs">
            {project.total_commitments} commitments · Lines: {fmt(project.total_lines_amount)} · Commitments: {fmt(project.total_commitment_invoiced)}
          </p>
        </div>
        <Badge className={Math.abs(project.header_delta) > 0.01 ? "bg-yellow-600" : "bg-green-600"}>
          {fmt(project.header_delta)} delta
        </Badge>
      </div>

      {hasDrifts && (
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-400 text-xs">Commitment</TableHead>
              <TableHead className="text-gray-400 text-xs">Type</TableHead>
              <TableHead className="text-gray-400 text-xs text-right">Commitment Says</TableHead>
              <TableHead className="text-gray-400 text-xs text-center"></TableHead>
              <TableHead className="text-gray-400 text-xs text-right">Lines Say</TableHead>
              <TableHead className="text-gray-400 text-xs text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {project.drifts.map(d => (
              <TableRow key={d.commitment_id} className="border-b border-gray-800">
                <TableCell className="text-white text-xs font-mono">{d.commitment_id.slice(0, 12)}...</TableCell>
                <TableCell>
                  <Badge className={d.drift_type === "UNDER_REPORTED" ? "bg-yellow-600" : "bg-red-600"}>
                    {d.drift_type === "UNDER_REPORTED" ? "Under" : "Over"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-gray-300 text-sm">{fmt(d.commitment_invoiced)}</TableCell>
                <TableCell className="text-center"><ArrowRight className="w-4 h-4 text-gray-600 mx-auto" /></TableCell>
                <TableCell className="text-right text-green-400 text-sm font-medium">{fmt(d.invoice_line_sum)}</TableCell>
                <TableCell className="text-right text-yellow-400 text-sm font-medium">{fmt(d.delta)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {hasOrphans && (
        <div className="p-3 border-t border-gray-800">
          <p className="text-xs text-orange-400 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3 h-3" />
            Orphan-linked lines (lines referencing cancelled/inactive commitments)
          </p>
          <div className="space-y-1">
            {project.orphan_linked_lines.map(o => (
              <div key={o.commitment_id} className="flex items-center justify-between text-xs px-2 py-1 bg-gray-900/30 rounded">
                <span className="text-gray-400 font-mono">{o.commitment_id.slice(0, 12)}...</span>
                <span className="text-orange-400 font-medium">{fmt(o.line_sum)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasDrifts && !hasOrphans && (
        <div className="p-3 text-center text-gray-500 text-sm">
          Header-level drift only — likely from unlinked or orphan lines
        </div>
      )}
    </div>
  );
}

function ApplyResult({ result }) {
  if (!result.success) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-600/30 rounded-lg">
        <p className="text-red-400 font-medium">Repair Failed</p>
        <p className="text-gray-400 text-sm">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn(
        "p-4 rounded-lg border",
        result.all_clear
          ? "bg-green-900/20 border-green-600/30"
          : "bg-yellow-900/20 border-yellow-600/30"
      )}>
        <div className="flex items-center gap-3 mb-2">
          {result.all_clear ? (
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
          )}
          <p className={cn("font-medium text-lg", result.all_clear ? "text-green-400" : "text-yellow-400")}>
            {result.all_clear ? "Reconciliation Complete — Zero Drift" : "Partial Reconciliation"}
          </p>
        </div>
        <p className="text-gray-400 text-sm">
          Fixed {result.commitments_fixed} commitment(s) across {result.projects_repaired} project(s).
          Total corrected: {fmt(result.total_delta_corrected)}
        </p>
        {result.note && (
          <p className="text-orange-400 text-xs mt-2">{result.note}</p>
        )}
      </div>

      {/* Change Log */}
      {result.changes.length > 0 && (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <div className="p-3 bg-gray-900/50">
            <p className="text-white font-medium text-sm">Change Log</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-400 text-xs">Type</TableHead>
                <TableHead className="text-gray-400 text-xs">Commitment</TableHead>
                <TableHead className="text-gray-400 text-xs text-right">Before</TableHead>
                <TableHead className="text-gray-400 text-xs text-center"></TableHead>
                <TableHead className="text-gray-400 text-xs text-right">After</TableHead>
                <TableHead className="text-gray-400 text-xs text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.changes.map((c, i) => (
                <TableRow key={i} className="border-b border-gray-800">
                  <TableCell>
                    <Badge className={c.repair_type === "orphan_commitment_sync" ? "bg-orange-600" : "bg-blue-600"}>
                      {c.repair_type === "orphan_commitment_sync" ? "Orphan" : "Sync"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white text-xs font-mono">{c.commitment_id.slice(0, 12)}...</TableCell>
                  <TableCell className="text-right text-gray-400 text-sm">{fmt(c.before)}</TableCell>
                  <TableCell className="text-center"><ArrowRight className="w-4 h-4 text-gray-600 mx-auto" /></TableCell>
                  <TableCell className="text-right text-green-400 text-sm font-medium">{fmt(c.after)}</TableCell>
                  <TableCell className="text-right text-yellow-400 text-sm font-medium">{fmt(c.delta)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Validation Results */}
      {result.validation?.length > 0 && (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <div className="p-3 bg-gray-900/50">
            <p className="text-white font-medium text-sm">Post-Fix Validation</p>
          </div>
          <div className="p-3 space-y-2">
            {result.validation.map(v => (
              <div key={v.project_id} className="flex items-center justify-between px-3 py-2 bg-gray-900/30 rounded">
                <span className="text-gray-300 text-sm font-mono">{v.project_id.slice(0, 16)}...</span>
                {v.success ? (
                  <Badge className="bg-green-600">✓ Zero Drift</Badge>
                ) : (
                  <Badge className="bg-yellow-600">
                    Remaining: {fmt(v.remaining_header_drift)} header, {v.remaining_count} commitments
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}