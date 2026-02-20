import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Search,
  Code,
  Zap,
  AlertCircle,
  FileWarning
} from "lucide-react";

/**
 * Phase 9 — Wiring Audit Dashboard
 * 
 * Engineering tooling for verifying UI → Backend wiring integrity.
 * No styling polish - pure function.
 */
export default function WiringAuditDashboard() {
  const [pageFilter, setPageFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: auditResult, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wiringAudit'],
    queryFn: async () => {
      const response = await base44.functions.invoke('auditWiringIntegrity', {});
      return response.data;
    },
    staleTime: 60000, // 1 minute
  });

  const pages = useMemo(() => {
    if (!auditResult?.action_inventory) return [];
    return [...new Set(auditResult.action_inventory.map(a => a.page))];
  }, [auditResult]);

  const filteredActions = useMemo(() => {
    if (!auditResult?.action_inventory) return [];
    let actions = auditResult.action_inventory;
    
    if (pageFilter !== "all") {
      actions = actions.filter(a => a.page === pageFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      actions = actions.filter(a => 
        a.component.toLowerCase().includes(term) ||
        a.button_label.toLowerCase().includes(term) ||
        (a.backend_function || '').toLowerCase().includes(term)
      );
    }
    return actions;
  }, [auditResult, pageFilter, searchTerm]);

  const filteredViolations = useMemo(() => {
    if (!auditResult?.violations) return [];
    let violations = auditResult.violations;
    
    if (pageFilter !== "all") {
      violations = violations.filter(v => v.page === pageFilter);
    }
    if (severityFilter !== "all") {
      violations = violations.filter(v => v.severity === severityFilter);
    }
    return violations;
  }, [auditResult, pageFilter, severityFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-500 mb-4" />
          <p className="text-gray-400">Running wiring audit...</p>
        </div>
      </div>
    );
  }

  if (!auditResult) {
    return (
      <div className="min-h-screen bg-gray-950 p-6">
        <Card className="bg-red-900/20 border-red-800">
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <p className="text-red-300">Failed to load audit results</p>
            <Button onClick={() => refetch()} className="mt-4">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, phase9_status, wiring_score } = auditResult;

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Code className="w-6 h-6 text-purple-400" />
              Wiring Audit Dashboard
            </h1>
            <p className="text-gray-500 text-sm">Phase 9 — Engineering Tooling</p>
          </div>
          <Button 
            onClick={() => refetch()} 
            variant="outline"
            className="border-gray-700 gap-2"
            disabled={isRefetching}
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Re-run Audit
          </Button>
        </div>

        {/* Critical Banner */}
        {!phase9_status.can_proceed && (
          <div className="bg-red-900/50 border border-red-600 p-4 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-200 font-semibold">WIRING INTEGRITY FAILURE</p>
              <p className="text-red-300 text-sm">
                {summary.critical_failures} critical, {summary.legacy_references} legacy, {summary.contract_mismatches} contract mismatches
              </p>
            </div>
          </div>
        )}

        {/* Score Card */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <Card className={`col-span-2 ${wiring_score >= 90 ? 'bg-green-900/30 border-green-700' : wiring_score >= 70 ? 'bg-yellow-900/30 border-yellow-700' : 'bg-red-900/30 border-red-700'}`}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-gray-400 uppercase">Wiring Score</p>
              <p className={`text-4xl font-bold ${wiring_score >= 90 ? 'text-green-400' : wiring_score >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                {wiring_score}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-gray-500">Total Actions</p>
              <p className="text-2xl font-bold text-white">{summary.total_actions}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-gray-500">Fully Wired</p>
              <p className="text-2xl font-bold text-green-400">{summary.fully_wired}</p>
            </CardContent>
          </Card>
          
          <Card className={`${summary.critical_failures > 0 ? 'bg-red-900/50 border-red-700' : 'bg-gray-900 border-gray-800'}`}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-gray-500">Critical</p>
              <p className={`text-2xl font-bold ${summary.critical_failures > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {summary.critical_failures}
              </p>
            </CardContent>
          </Card>
          
          <Card className={`${summary.high_failures > 0 ? 'bg-orange-900/30 border-orange-700' : 'bg-gray-900 border-gray-800'}`}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-gray-500">High</p>
              <p className={`text-2xl font-bold ${summary.high_failures > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                {summary.high_failures}
              </p>
            </CardContent>
          </Card>
          
          <Card className={`${summary.legacy_references > 0 ? 'bg-purple-900/30 border-purple-700' : 'bg-gray-900 border-gray-800'}`}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-gray-500">Legacy</p>
              <p className={`text-2xl font-bold ${summary.legacy_references > 0 ? 'text-purple-400' : 'text-gray-500'}`}>
                {summary.legacy_references}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Phase 9 Criteria */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400 uppercase">Phase 9 Pass Criteria</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-6">
            <div className="flex items-center gap-2">
              {phase9_status.critical_zero ? 
                <CheckCircle2 className="w-5 h-5 text-green-400" /> : 
                <XCircle className="w-5 h-5 text-red-400" />}
              <span className={phase9_status.critical_zero ? 'text-green-400' : 'text-red-400'}>CRITICAL = 0</span>
            </div>
            <div className="flex items-center gap-2">
              {phase9_status.legacy_zero ? 
                <CheckCircle2 className="w-5 h-5 text-green-400" /> : 
                <XCircle className="w-5 h-5 text-red-400" />}
              <span className={phase9_status.legacy_zero ? 'text-green-400' : 'text-red-400'}>LEGACY = 0</span>
            </div>
            <div className="flex items-center gap-2">
              {phase9_status.contract_mismatch_zero ? 
                <CheckCircle2 className="w-5 h-5 text-green-400" /> : 
                <XCircle className="w-5 h-5 text-red-400" />}
              <span className={phase9_status.contract_mismatch_zero ? 'text-green-400' : 'text-red-400'}>CONTRACT_MISMATCH = 0</span>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search actions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-gray-900 border-gray-700"
            />
          </div>
          <Select value={pageFilter} onValueChange={setPageFilter}>
            <SelectTrigger className="w-48 bg-gray-900 border-gray-700">
              <SelectValue placeholder="Filter by page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pages</SelectItem>
              {pages.map(page => (
                <SelectItem key={page} value={page}>{page}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-40 bg-gray-900 border-gray-700">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="violations" className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="violations" className="gap-2 data-[state=active]:bg-red-900/30">
              <AlertTriangle className="w-4 h-4" />
              Violations ({filteredViolations.length})
            </TabsTrigger>
            <TabsTrigger value="actions" className="gap-2 data-[state=active]:bg-blue-900/30">
              <Zap className="w-4 h-4" />
              All Actions ({filteredActions.length})
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-2 data-[state=active]:bg-purple-900/30">
              <FileWarning className="w-4 h-4" />
              Contracts ({auditResult.function_contracts?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Violations Tab */}
          <TabsContent value="violations">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                {filteredViolations.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-4" />
                    <p className="text-green-400">No violations found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800">
                        <TableHead className="text-gray-500 w-24">Severity</TableHead>
                        <TableHead className="text-gray-500">Page</TableHead>
                        <TableHead className="text-gray-500">Component</TableHead>
                        <TableHead className="text-gray-500">Code</TableHead>
                        <TableHead className="text-gray-500">Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredViolations.map((v, idx) => (
                        <TableRow key={idx} className="border-gray-800">
                          <TableCell>
                            <Badge className={
                              v.severity === 'CRITICAL' ? 'bg-red-600' :
                              v.severity === 'HIGH' ? 'bg-orange-600' :
                              'bg-yellow-600'
                            }>
                              {v.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-300 font-mono text-sm">{v.page}</TableCell>
                          <TableCell className="text-white">{v.component}</TableCell>
                          <TableCell className="text-purple-400 font-mono text-xs">{v.code}</TableCell>
                          <TableCell className="text-gray-400 text-sm">{v.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-500">Page</TableHead>
                      <TableHead className="text-gray-500">Component</TableHead>
                      <TableHead className="text-gray-500">Button</TableHead>
                      <TableHead className="text-gray-500">Backend</TableHead>
                      <TableHead className="text-gray-500">Status</TableHead>
                      <TableHead className="text-gray-500 text-center">Audit</TableHead>
                      <TableHead className="text-gray-500 text-center">Invalidate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActions.map((action, idx) => (
                      <TableRow key={idx} className="border-gray-800">
                        <TableCell className="text-gray-400 font-mono text-xs">{action.page}</TableCell>
                        <TableCell className="text-white text-sm">{action.component}</TableCell>
                        <TableCell className="text-gray-300">{action.button_label}</TableCell>
                        <TableCell className="text-purple-400 font-mono text-xs">
                          {action.backend_function || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            action.wiring_status === 'OK' ? 'bg-green-600' :
                            action.wiring_status === 'MODAL_OPENS' ? 'bg-blue-600' :
                            action.wiring_status === 'ENTITY_DIRECT' ? 'bg-cyan-600' :
                            'bg-red-600'
                          }>
                            {action.wiring_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {action.has_audit_tracking ? 
                            <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : 
                            <XCircle className="w-4 h-4 text-gray-600 mx-auto" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {action.invalidates_query ? 
                            <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : 
                            <XCircle className="w-4 h-4 text-gray-600 mx-auto" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contracts Tab */}
          <TabsContent value="contracts">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-500">Function</TableHead>
                      <TableHead className="text-gray-500">Expected Shape</TableHead>
                      <TableHead className="text-gray-500">Match</TableHead>
                      <TableHead className="text-gray-500">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.function_contracts?.map((contract, idx) => (
                      <TableRow key={idx} className="border-gray-800">
                        <TableCell className="text-purple-400 font-mono text-sm">{contract.function_name}</TableCell>
                        <TableCell className="text-gray-400 text-xs font-mono">
                          {Object.entries(contract.expected_shape).map(([k, v]) => (
                            <div key={k}>{k}: {v}</div>
                          ))}
                        </TableCell>
                        <TableCell>
                          {contract.actual_shape_matches ? 
                            <CheckCircle2 className="w-5 h-5 text-green-400" /> : 
                            <XCircle className="w-5 h-5 text-red-400" />}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{contract.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Timestamp */}
        <p className="text-center text-gray-600 text-xs">
          Audit run: {auditResult.timestamp}
        </p>
      </div>
    </div>
  );
}