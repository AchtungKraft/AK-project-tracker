import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Activity,
  Database,
  ArrowLeftRight,
  Package,
  Undo2,
  Search,
  Filter
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MUTATION_TYPE_CONFIG = {
  receive: { icon: Package, color: "bg-green-600", label: "Receive" },
  move: { icon: ArrowLeftRight, color: "bg-blue-600", label: "Move" },
  install: { icon: Database, color: "bg-purple-600", label: "Install" },
  reversal: { icon: Undo2, color: "bg-orange-600", label: "Reversal" },
  adjustment: { icon: Activity, color: "bg-yellow-600", label: "Adjustment" },
};

const STATUS_CONFIG = {
  success: { icon: CheckCircle2, color: "text-green-400", bgColor: "bg-green-900/30" },
  failed: { icon: XCircle, color: "text-red-400", bgColor: "bg-red-900/30" },
  rolled_back: { icon: Undo2, color: "text-orange-400", bgColor: "bg-orange-900/30" },
};

export default function InventoryMutationMonitor() {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchPartId, setSearchPartId] = useState("");

  // Fetch mutation logs
  const { data: mutationLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['inventory-mutation-logs'],
    queryFn: () => base44.entities.InventoryMutationLog.list('-created_date', 100),
  });

  // Fetch parts for lookup
  const { data: parts = [] } = useQuery({
    queryKey: ['parts-lookup'],
    queryFn: () => base44.entities.Part.list(),
  });

  // Validate audit chain mutation
  const validateAuditMutation = useMutation({
    mutationFn: (params) => base44.functions.invoke('validateInventoryAuditChain', params),
    onSuccess: (data) => {
      queryClient.setQueryData(['audit-validation-result'], data.data);
    },
  });

  // Reconcile task installs mutation
  const reconcileMutation = useMutation({
    mutationFn: (params) => base44.functions.invoke('reconcileTaskInstallStatus', params),
    onSuccess: (data) => {
      queryClient.setQueryData(['reconcile-result'], data.data);
    },
  });

  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));

  // Filter logs
  const filteredLogs = mutationLogs.filter(log => {
    if (filterType !== "all" && log.mutation_type !== filterType) return false;
    if (filterStatus !== "all" && log.result_status !== filterStatus) return false;
    if (searchPartId && !log.part_id?.includes(searchPartId)) return false;
    return true;
  });

  // Calculate stats
  const stats = {
    total: mutationLogs.length,
    successful: mutationLogs.filter(l => l.result_status === 'success').length,
    failed: mutationLogs.filter(l => l.result_status === 'failed').length,
    avgExecutionTime: mutationLogs.length > 0 
      ? Math.round(mutationLogs.reduce((sum, l) => sum + (l.execution_time_ms || 0), 0) / mutationLogs.length)
      : 0,
    byType: Object.entries(MUTATION_TYPE_CONFIG).map(([type, config]) => ({
      type,
      ...config,
      count: mutationLogs.filter(l => l.mutation_type === type).length,
    })),
  };

  // High frequency alerts (more than 10 mutations in last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentMutations = mutationLogs.filter(l => l.created_date > oneHourAgo);
  const highFrequencyAlert = recentMutations.length > 10;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Activity className="w-6 h-6 text-red-500" />
              Inventory Mutation Monitor
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Debug and monitor inventory mutations, validate audit chains, and reconcile data
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => refetchLogs()}
            disabled={logsLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Alerts */}
        {highFrequencyAlert && (
          <Card className="bg-yellow-900/20 border-yellow-600/50">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <span className="text-yellow-200">
                High mutation frequency detected: {recentMutations.length} mutations in the last hour
              </span>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-white">{stats.total}</div>
              <div className="text-gray-400 text-sm">Total Mutations</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-green-400">{stats.successful}</div>
              <div className="text-gray-400 text-sm">Successful</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-red-400">{stats.failed}</div>
              <div className="text-gray-400 text-sm">Failed</div>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-blue-400">{stats.avgExecutionTime}ms</div>
              <div className="text-gray-400 text-sm">Avg Execution Time</div>
            </CardContent>
          </Card>
        </div>

        {/* Mutation Type Breakdown */}
        <div className="flex gap-2 flex-wrap">
          {stats.byType.map(({ type, icon: Icon, color, label, count }) => (
            <Badge key={type} className={`${color} text-white px-3 py-1`}>
              <Icon className="w-3 h-3 mr-1" />
              {label}: {count}
            </Badge>
          ))}
        </div>

        <Tabs defaultValue="mutations" className="space-y-4">
          <TabsList className="bg-gray-800 border border-gray-700">
            <TabsTrigger value="mutations">Recent Mutations</TabsTrigger>
            <TabsTrigger value="validation">Audit Validation</TabsTrigger>
            <TabsTrigger value="reconciliation">Task Reconciliation</TabsTrigger>
          </TabsList>

          {/* Mutations Tab */}
          <TabsContent value="mutations">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Recent Mutations</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        placeholder="Search by Part ID..."
                        value={searchPartId}
                        onChange={(e) => setSearchPartId(e.target.value)}
                        className="pl-9 w-48 bg-gray-900 border-gray-600"
                      />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-32 bg-gray-900 border-gray-600">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {Object.entries(MUTATION_TYPE_CONFIG).map(([type, { label }]) => (
                          <SelectItem key={type} value={type}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-32 bg-gray-900 border-gray-600">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="rolled_back">Rolled Back</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-700">
                        <TableHead className="text-gray-400">Time</TableHead>
                        <TableHead className="text-gray-400">Type</TableHead>
                        <TableHead className="text-gray-400">Part</TableHead>
                        <TableHead className="text-gray-400">Qty</TableHead>
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400">Duration</TableHead>
                        <TableHead className="text-gray-400">Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.slice(0, 50).map((log) => {
                        const typeConfig = MUTATION_TYPE_CONFIG[log.mutation_type] || {};
                        const statusConfig = STATUS_CONFIG[log.result_status] || STATUS_CONFIG.success;
                        const StatusIcon = statusConfig.icon;
                        const part = partsMap[log.part_id];
                        
                        return (
                          <TableRow key={log.id} className="border-gray-700">
                            <TableCell className="text-gray-300 text-sm">
                              {new Date(log.created_date).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${typeConfig.color || 'bg-gray-600'} text-white`}>
                                {typeConfig.label || log.mutation_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-gray-300 text-sm max-w-[200px] truncate">
                              {part?.part_name || log.part_id?.slice(0, 8)}
                            </TableCell>
                            <TableCell className="text-white font-medium">
                              {log.qty}
                            </TableCell>
                            <TableCell>
                              <div className={`flex items-center gap-1 ${statusConfig.color}`}>
                                <StatusIcon className="w-4 h-4" />
                                <span className="text-sm capitalize">{log.result_status}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-gray-400 text-sm">
                              {log.execution_time_ms}ms
                            </TableCell>
                            <TableCell className="text-red-400 text-sm max-w-[200px] truncate">
                              {log.error_message || '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {filteredLogs.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No mutations found matching filters
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Validation Tab */}
          <TabsContent value="validation">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Audit Chain Validation</CardTitle>
                <CardDescription className="text-gray-400">
                  Verify that audit log deltas match current inventory balances
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={() => validateAuditMutation.mutate({ full_scan: true })}
                  disabled={validateAuditMutation.isPending}
                >
                  {validateAuditMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4 mr-2" />
                  )}
                  Run Full Validation
                </Button>

                {validateAuditMutation.data?.data && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg ${validateAuditMutation.data.data.valid ? 'bg-green-900/30 border border-green-600/50' : 'bg-red-900/30 border border-red-600/50'}`}>
                      <div className="flex items-center gap-2">
                        {validateAuditMutation.data.data.valid ? (
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-red-400" />
                        )}
                        <span className={validateAuditMutation.data.data.valid ? 'text-green-200' : 'text-red-200'}>
                          {validateAuditMutation.data.data.valid 
                            ? 'Audit chain is valid - no discrepancies found'
                            : `${validateAuditMutation.data.data.discrepancies?.length || 0} discrepancies found`
                          }
                        </span>
                      </div>
                    </div>

                    {validateAuditMutation.data.data.summary && (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gray-900 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-white">
                            {validateAuditMutation.data.data.summary.parts_checked}
                          </div>
                          <div className="text-gray-400 text-sm">Parts Checked</div>
                        </div>
                        <div className="bg-gray-900 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-white">
                            {validateAuditMutation.data.data.summary.locations_checked}
                          </div>
                          <div className="text-gray-400 text-sm">Locations Checked</div>
                        </div>
                        <div className="bg-gray-900 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-red-400">
                            {validateAuditMutation.data.data.summary.total_drift}
                          </div>
                          <div className="text-gray-400 text-sm">Total Drift</div>
                        </div>
                      </div>
                    )}

                    {validateAuditMutation.data.data.discrepancies?.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-700">
                            <TableHead className="text-gray-400">Part</TableHead>
                            <TableHead className="text-gray-400">Location</TableHead>
                            <TableHead className="text-gray-400">Actual</TableHead>
                            <TableHead className="text-gray-400">Expected</TableHead>
                            <TableHead className="text-gray-400">Drift</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {validateAuditMutation.data.data.discrepancies.map((d, i) => (
                            <TableRow key={i} className="border-gray-700">
                              <TableCell className="text-gray-300">{partsMap[d.part_id]?.part_name || d.part_id?.slice(0, 8)}</TableCell>
                              <TableCell className="text-gray-300">{d.location_id?.slice(0, 8) || '-'}</TableCell>
                              <TableCell className="text-white">{d.actual_qty}</TableCell>
                              <TableCell className="text-white">{d.expected_qty}</TableCell>
                              <TableCell className={d.drift > 0 ? 'text-green-400' : 'text-red-400'}>
                                {d.drift > 0 ? '+' : ''}{d.drift}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reconciliation Tab */}
          <TabsContent value="reconciliation">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Task Install Status Reconciliation</CardTitle>
                <CardDescription className="text-gray-400">
                  Verify TaskPartLink install status matches InstalledPart totals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => reconcileMutation.mutate({ dry_run: true, auto_correct: false })}
                    disabled={reconcileMutation.isPending}
                  >
                    {reconcileMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4 mr-2" />
                    )}
                    Dry Run Check
                  </Button>
                  <Button 
                    onClick={() => reconcileMutation.mutate({ dry_run: false, auto_correct: true })}
                    disabled={reconcileMutation.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Auto-Correct Issues
                  </Button>
                </div>

                {reconcileMutation.data?.data && (
                  <div className="space-y-4">
                    {reconcileMutation.data.data.summary && (
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-gray-900 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-white">
                            {reconcileMutation.data.data.summary.total_checked}
                          </div>
                          <div className="text-gray-400 text-sm">Links Checked</div>
                        </div>
                        <div className="bg-gray-900 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-green-400">
                            {reconcileMutation.data.data.summary.already_correct}
                          </div>
                          <div className="text-gray-400 text-sm">Already Correct</div>
                        </div>
                        <div className="bg-gray-900 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-400">
                            {reconcileMutation.data.data.summary.needs_correction}
                          </div>
                          <div className="text-gray-400 text-sm">Needs Correction</div>
                        </div>
                        <div className="bg-gray-900 p-3 rounded-lg">
                          <div className="text-2xl font-bold text-blue-400">
                            {reconcileMutation.data.data.summary.corrected}
                          </div>
                          <div className="text-gray-400 text-sm">Corrected</div>
                        </div>
                      </div>
                    )}

                    {reconcileMutation.data.data.corrections?.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-700">
                            <TableHead className="text-gray-400">Task Link</TableHead>
                            <TableHead className="text-gray-400">Recorded Qty</TableHead>
                            <TableHead className="text-gray-400">Actual Qty</TableHead>
                            <TableHead className="text-gray-400">Current Status</TableHead>
                            <TableHead className="text-gray-400">Expected Status</TableHead>
                            <TableHead className="text-gray-400">Corrected</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reconcileMutation.data.data.corrections.map((c, i) => (
                            <TableRow key={i} className="border-gray-700">
                              <TableCell className="text-gray-300">{c.task_part_link_id?.slice(0, 8)}</TableCell>
                              <TableCell className="text-white">{c.current_qty_installed}</TableCell>
                              <TableCell className="text-white">{c.actual_qty_installed}</TableCell>
                              <TableCell><Badge variant="outline">{c.current_status}</Badge></TableCell>
                              <TableCell><Badge className="bg-blue-600">{c.expected_status}</Badge></TableCell>
                              <TableCell>
                                {c.corrected ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-gray-500" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}