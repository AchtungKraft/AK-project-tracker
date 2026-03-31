import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Shield, Database,
  Eye, Wrench, AlertCircle, Link2Off, Filter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function SeverityBadge({ severity }) {
  const cfg = { error: 'bg-red-600', warning: 'bg-yellow-600', info: 'bg-blue-600' };
  return <Badge className={cn(cfg[severity] || 'bg-gray-600', 'text-white text-[10px]')}>{severity?.toUpperCase()}</Badge>;
}

function TypeBadge({ type }) {
  const cfg = {
    FIELD_MISMATCH: { color: 'bg-amber-900/50 text-amber-300 border-amber-700', label: 'Mismatch' },
    NEGATIVE_COVERED: { color: 'bg-red-900/50 text-red-300 border-red-700', label: 'Negative' },
    RESERVED_EXCEEDS_STOCK: { color: 'bg-orange-900/50 text-orange-300 border-orange-700', label: 'Over-Reserved' },
    INVARIANT_VIOLATION: { color: 'bg-red-900/50 text-red-300 border-red-700', label: 'Invariant' },
    INSTALLED_EXCEEDS_REQUIRED: { color: 'bg-purple-900/50 text-purple-300 border-purple-700', label: 'Over-Install' },
    ORPHAN_PO_LINE: { color: 'bg-cyan-900/50 text-cyan-300 border-cyan-700', label: 'Orphan PO' },
  };
  const c = cfg[type] || { color: 'bg-gray-800 text-gray-300', label: type };
  return <Badge variant="outline" className={cn(c.color, 'text-[10px]')}>{c.label}</Badge>;
}

export default function DataAlignmentDashboard() {
  const queryClient = useQueryClient();
  const [sevFilter, setSevFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [fixType, setFixType] = useState('BATCH_ALIGN');
  const [isApplying, setIsApplying] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dataAlignmentDiagnostics'],
    queryFn: async () => {
      const r = await base44.functions.invoke('runDataAlignmentDiagnostics', {});
      return r.data;
    },
    staleTime: 30000,
  });

  const filtered = useMemo(() => {
    if (!data?.issues) return [];
    let items = data.issues;
    if (sevFilter !== 'all') items = items.filter(i => i.severity === sevFilter);
    if (typeFilter !== 'all') items = items.filter(i => i.type === typeFilter);
    return items;
  }, [data, sevFilter, typeFilter]);

  const fixableIds = useMemo(() => {
    return [...new Set(filtered.filter(i => i.entity === 'PartCommitment' && i.fix).map(i => i.id))];
  }, [filtered]);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const selectAllFixable = () => setSelectedIds(new Set(fixableIds));
  const clearSelection = () => setSelectedIds(new Set());

  const handlePreview = async () => {
    if (selectedIds.size === 0) { toast.error('Select records to preview'); return; }
    setIsApplying(true);
    try {
      const r = await base44.functions.invoke('applyDataAlignmentFix', {
        fix_type: fixType, commitment_ids: [...selectedIds], dry_run: true
      });
      setPreviewResult(r.data);
      toast.success(`Preview: ${r.data.total_with_changes} records would change`);
    } catch (e) { toast.error(e.message); }
    finally { setIsApplying(false); }
  };

  const handleApply = async () => {
    if (!previewResult || previewResult.total_with_changes === 0) { toast.error('Nothing to apply'); return; }
    if (!confirm(`Apply ${fixType} to ${previewResult.total_with_changes} records? This will be logged.`)) return;
    setIsApplying(true);
    try {
      const r = await base44.functions.invoke('applyDataAlignmentFix', {
        fix_type: fixType, commitment_ids: [...selectedIds], dry_run: false
      });
      toast.success(`Applied fixes to ${r.data.total_applied} records`);
      setPreviewResult(null);
      setSelectedIds(new Set());
      refetch();
    } catch (e) { toast.error(e.message); }
    finally { setIsApplying(false); }
  };

  if (isLoading) return (
    <div className="min-h-screen bg-gray-950 p-6 flex items-center justify-center">
      <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
    </div>
  );

  const summary = data?.summary || {};

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Database className="w-6 h-6 text-blue-400" />
              Data Alignment Dashboard
            </h1>
            <p className="text-gray-500 text-sm">Phase 2 — Canonical Field Alignment & Diagnostics</p>
          </div>
          <Button onClick={() => refetch()} variant="outline" className="border-gray-700 gap-2" disabled={isRefetching}>
            <RefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} /> Scan
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase">Scanned</p>
              <p className="text-lg font-bold text-white">{data?.scanned?.commitments || 0}</p>
              <p className="text-[10px] text-gray-600">commitments</p>
            </CardContent>
          </Card>
          <Card className={cn("border-gray-800", summary.total > 0 ? "bg-red-900/20" : "bg-green-900/20")}>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase">Issues</p>
              <p className={cn("text-lg font-bold", summary.total > 0 ? "text-red-400" : "text-green-400")}>{summary.total || 0}</p>
            </CardContent>
          </Card>
          <Card className={cn("border-gray-800", summary.errors > 0 ? "bg-red-900/30" : "bg-gray-900")}>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase">Errors</p>
              <p className={cn("text-lg font-bold", summary.errors > 0 ? "text-red-400" : "text-gray-500")}>{summary.errors || 0}</p>
            </CardContent>
          </Card>
          <Card className={cn("border-gray-800", summary.warnings > 0 ? "bg-amber-900/30" : "bg-gray-900")}>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase">Warnings</p>
              <p className={cn("text-lg font-bold", summary.warnings > 0 ? "text-amber-400" : "text-gray-500")}>{summary.warnings || 0}</p>
            </CardContent>
          </Card>
          <Card className={cn("border-gray-800", (data?.orphan_po_lines || 0) > 0 ? "bg-cyan-900/30" : "bg-gray-900")}>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase">Orphan PO</p>
              <p className={cn("text-lg font-bold", (data?.orphan_po_lines || 0) > 0 ? "text-cyan-400" : "text-gray-500")}>{data?.orphan_po_lines || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase">PO Lines</p>
              <p className="text-lg font-bold text-white">{data?.scanned?.po_lines || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Type Breakdown */}
        {summary.by_type && Object.keys(summary.by_type).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.by_type).map(([type, count]) => (
              <button key={type} onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
                className={cn("flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition",
                  typeFilter === type ? "border-white bg-white/10 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"
                )}>
                <TypeBadge type={type} /> <span className="font-mono">{count}</span>
              </button>
            ))}
          </div>
        )}

        <Tabs defaultValue="issues" className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="issues" className="gap-2 data-[state=active]:bg-red-900/30">
              <AlertTriangle className="w-4 h-4" /> Issues ({filtered.length})
            </TabsTrigger>
            <TabsTrigger value="fix" className="gap-2 data-[state=active]:bg-blue-900/30">
              <Wrench className="w-4 h-4" /> Fix Tool
            </TabsTrigger>
            {previewResult && (
              <TabsTrigger value="preview" className="gap-2 data-[state=active]:bg-green-900/30">
                <Eye className="w-4 h-4" /> Preview ({previewResult.total_with_changes})
              </TabsTrigger>
            )}
          </TabsList>

          {/* Issues Tab */}
          <TabsContent value="issues">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={sevFilter} onValueChange={setSevFilter}>
                <SelectTrigger className="w-32 h-8 text-xs bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                  <SelectItem value="warning">Warnings</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-500 ml-auto">{filtered.length} issues</span>
            </div>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-4" />
                    <p className="text-green-400">No issues found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800">
                          <TableHead className="w-8"></TableHead>
                          <TableHead className="text-gray-500 w-20">Severity</TableHead>
                          <TableHead className="text-gray-500 w-28">Type</TableHead>
                          <TableHead className="text-gray-500">Part</TableHead>
                          <TableHead className="text-gray-500">Message</TableHead>
                          <TableHead className="text-gray-500 w-20">Current</TableHead>
                          <TableHead className="text-gray-500 w-20">Expected</TableHead>
                          <TableHead className="text-gray-500 w-16">Fixable</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.slice(0, 200).map((issue, idx) => (
                          <TableRow key={`${issue.id}-${idx}`} className="border-gray-800">
                            <TableCell>
                              {issue.entity === 'PartCommitment' && issue.fix && (
                                <Checkbox checked={selectedIds.has(issue.id)} onCheckedChange={() => toggleSelect(issue.id)} className="h-3.5 w-3.5" />
                              )}
                            </TableCell>
                            <TableCell><SeverityBadge severity={issue.severity} /></TableCell>
                            <TableCell><TypeBadge type={issue.type} /></TableCell>
                            <TableCell className="text-white text-xs truncate max-w-[150px]">{issue.part_name}</TableCell>
                            <TableCell className="text-gray-400 text-xs">{issue.message}</TableCell>
                            <TableCell className="text-red-400 text-xs font-mono">{issue.current ?? '-'}</TableCell>
                            <TableCell className="text-green-400 text-xs font-mono">{issue.expected ?? '-'}</TableCell>
                            <TableCell>{issue.fix ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-600" />}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fix Tool Tab */}
          <TabsContent value="fix">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Admin Correction Tool
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">Fix Type:</span>
                  <Select value={fixType} onValueChange={setFixType}>
                    <SelectTrigger className="w-64 h-9 bg-gray-800 border-gray-700"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BATCH_ALIGN">Full Alignment (deprecated → canonical)</SelectItem>
                      <SelectItem value="ALIGN_DEPRECATED">Align Deprecated Fields Only</SelectItem>
                      <SelectItem value="FIX_NEGATIVE_COVERED">Fix Negative covered_from_po</SelectItem>
                      <SelectItem value="RECOMPUTE_QUANTITIES">Recompute Gap & Coverage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">Selected: <span className="text-white font-mono">{selectedIds.size}</span></span>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-gray-700" onClick={selectAllFixable}>Select All Fixable ({fixableIds.length})</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>Clear</Button>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
                  <Button onClick={handlePreview} disabled={selectedIds.size === 0 || isApplying} variant="outline" className="border-blue-700 text-blue-400 gap-2">
                    <Eye className="w-4 h-4" /> Preview Changes
                  </Button>
                  <Button onClick={handleApply} disabled={!previewResult || previewResult.total_with_changes === 0 || isApplying}
                    className="bg-red-600 hover:bg-red-700 text-white gap-2">
                    <Wrench className="w-4 h-4" /> Apply {previewResult?.total_with_changes || 0} Fixes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preview Tab */}
          {previewResult && (
            <TabsContent value="preview">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-sm text-gray-400">Fix Preview — {previewResult.fix_type} (dry run)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800">
                        <TableHead className="text-gray-500">Commitment</TableHead>
                        <TableHead className="text-gray-500">Description</TableHead>
                        <TableHead className="text-gray-500">Changes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewResult.previews?.filter(p => p.has_changes).map((p, idx) => (
                        <TableRow key={idx} className="border-gray-800">
                          <TableCell className="text-gray-300 font-mono text-xs">{p.commitment_id?.slice(-8)}</TableCell>
                          <TableCell className="text-gray-400 text-xs">{p.description}</TableCell>
                          <TableCell className="text-xs">
                            {Object.entries(p.updates || {}).map(([k, v]) => (
                              <div key={k} className="flex gap-2">
                                <span className="text-gray-500">{k}:</span>
                                <span className="text-red-400 line-through">{p.before?.[k] ?? '-'}</span>
                                <span className="text-green-400">→ {v}</span>
                              </div>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        <p className="text-center text-gray-600 text-xs">Scan: {data?.timestamp || '-'}</p>
      </div>
    </div>
  );
}