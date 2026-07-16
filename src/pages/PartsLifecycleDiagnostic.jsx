import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { 
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Activity,
  Package,
  Link2,
  Filter,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// CONSTANTS
// ============================================

const LIFECYCLE_COLORS = {
  ASSIGNED_NEEDS_BILLING: { bg: 'bg-yellow-600', text: 'Needs Billing' },
  BILLED_NOT_PAID: { bg: 'bg-orange-600', text: 'Awaiting Payment' },
  PAID_READY_TO_ORDER: { bg: 'bg-green-600', text: 'Ready to Order' },
  ORDERED_WAITING_RECEIPT: { bg: 'bg-blue-600', text: 'In Progress' },
  INSTALLED_READY_TO_BILL: { bg: 'bg-purple-600', text: 'Installed Billing' },
  UNCATEGORIZED: { bg: 'bg-red-600', text: 'Uncategorized' },
};

const ROW_STATUS_COLORS = {
  FULLY_CLASSIFIED: 'border-l-4 border-l-green-500',
  UNCATEGORIZED: 'border-l-4 border-l-red-500',
  MISSING_RESOLVER: 'border-l-4 border-l-orange-500',
  MISSING_COMMITMENT: 'border-l-4 border-l-purple-500',
  DROPPED_BY_FILTER: 'border-l-4 border-l-blue-500',
};

// ============================================
// KPI CARDS
// ============================================

function DiagnosticKPIs({ totals, coverageStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-gray-400 uppercase">Assigned Parts</span>
          </div>
          <p className="text-2xl font-bold text-white">{totals?.commitments_count || 0}</p>
        </CardContent>
      </Card>
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-green-400" />
            <span className="text-xs text-gray-400 uppercase">Resolver Coverage</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{coverageStats?.resolver_coverage_pct || 0}%</p>
        </CardContent>
      </Card>
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-xs text-gray-400 uppercase">Lifecycle Coverage</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{coverageStats?.lifecycle_coverage_pct || 0}%</p>
        </CardContent>
      </Card>
      <Card className="bg-red-900/30 border-red-800/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-xs text-gray-400 uppercase">Uncategorized</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{totals?.uncategorized_count || 0}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// DETAIL DRAWER
// ============================================

function DiagnosticDetailDrawer({ row, isOpen, onClose }) {
  if (!row) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-gray-900 border-gray-700 p-0 overflow-hidden">
        <SheetHeader className="p-4 border-b border-gray-700">
          <SheetTitle className="text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-400" />
            Lifecycle Trace: {row.part_name}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="p-4 space-y-4">
            {/* Part Info */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white">Part Information</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Part Name</span>
                  <span className="text-white text-sm">{row.part_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Part Type</span>
                  <div className="flex items-center gap-1">
                    <Badge className="text-xs">{row.part_type}</Badge>
                    {row.part_type_missing && (
                      <Badge className="bg-amber-600/30 text-amber-400 text-xs">Defaulted</Badge>
                    )}
                  </div>
                </div>
                {row.part_type_missing && (
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400">Original Type</span>
                    <span className="text-xs text-red-400 italic">null (missing)</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Project</span>
                  <span className="text-white text-sm">{row.project_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Qty Assigned</span>
                  <span className="text-white text-sm">{row.assigned_qty}</span>
                </div>
              </CardContent>
            </Card>

            {/* Assignment Layer */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Assignment Layer
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Has Commitment</span>
                  {row.has_commitment ? 
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Commitment ID</span>
                  <span className="text-xs text-gray-500 font-mono">{row.commitment_id?.slice(0, 12)}...</span>
                </div>
              </CardContent>
            </Card>

            {/* Vendor Chain */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white">Vendor Chain</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Has Purchase Line Item</span>
                  {row.has_purchase_line_item ? 
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-gray-500" />}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Has Vendor Invoice</span>
                  {row.has_vendor_invoice ? 
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-gray-500" />}
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Order Status</span>
                  <Badge className="text-xs">{row.vendor_order_status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Ordered / Received</span>
                  <span className="text-white text-sm">{row.ordered_qty} / {row.received_qty}</span>
                </div>
              </CardContent>
            </Card>

            {/* Install Chain */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white">Install Chain</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Has Installed Part</span>
                  {row.has_installed_part ? 
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-gray-500" />}
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Installed Qty</span>
                  <span className="text-white text-sm">{row.installed_qty}</span>
                </div>
              </CardContent>
            </Card>

            {/* Resolver Data */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white">Resolver Data</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Resolver Present</span>
                  {row.resolver_present ? 
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Financial Role</span>
                  <Badge className="text-xs">{row.resolver_financial_role}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Client Billing</span>
                  <Badge className="text-xs">{row.resolver_client_billing_status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Client Payment</span>
                  <Badge className="text-xs">{row.resolver_client_payment_status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Unit Retail</span>
                  <span className={cn("text-sm", row.unit_retail > 0 ? "text-green-400" : "text-red-400")}>
                    ${(row.unit_retail || 0).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Classification */}
            <Card className={cn("border-gray-700", 
              row.lifecycle_category === 'UNCATEGORIZED' ? "bg-red-900/30" : "bg-gray-800/50"
            )}>
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white">Classification Decision</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Category</span>
                  <Badge className={cn("text-xs", LIFECYCLE_COLORS[row.lifecycle_category]?.bg || 'bg-gray-600')}>
                    {LIFECYCLE_COLORS[row.lifecycle_category]?.text || row.lifecycle_category}
                  </Badge>
                </div>
                <Separator className="bg-gray-700" />
                <div>
                  <span className="text-xs text-gray-400">Classification Reason</span>
                  <p className="text-xs text-white mt-1 font-mono bg-gray-900 p-2 rounded">
                    {row.classification_reason}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Missing Dependencies */}
            {row.missing_dependencies?.length > 0 && (
              <Card className="bg-orange-900/30 border-orange-700/50">
                <CardHeader className="p-3 border-b border-orange-700/50">
                  <CardTitle className="text-sm text-orange-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Missing Dependencies
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="space-y-1">
                    {row.missing_dependencies.map((dep, i) => (
                      <Badge key={i} className="bg-orange-600/30 text-orange-300 text-xs mr-1">
                        {dep}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dropped By Filter */}
            {row.dropped_by_filter?.length > 0 && (
              <Card className="bg-blue-900/30 border-blue-700/50">
                <CardHeader className="p-3 border-b border-blue-700/50">
                  <CardTitle className="text-sm text-blue-400 flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Would Be Dropped By Filters
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="space-y-1">
                    {row.dropped_by_filter.map((filter, i) => (
                      <Badge key={i} className="bg-blue-600/30 text-blue-300 text-xs mr-1 mb-1">
                        {filter}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PartsLifecycleDiagnostic() {
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedRow, setSelectedRow] = useState(null);

  // Fetch diagnostic data
  const { data: diagnosticData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['lifecycleDiagnostic', projectFilter],
    queryFn: async () => {
      const filters = {};
      if (projectFilter !== 'all') filters.project_id = projectFilter;
      
      const response = await base44.functions.invoke('diagnosePartsLifecycleCoverage', { filters });
      return response.data;
    },
    staleTime: 60000,
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!diagnosticData?.rows) return [];
    
    let rows = diagnosticData.rows;
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      rows = rows.filter(r => 
        r.part_name?.toLowerCase().includes(search) ||
        r.project_name?.toLowerCase().includes(search)
      );
    }
    
    if (categoryFilter !== 'all') {
      rows = rows.filter(r => r.lifecycle_category === categoryFilter);
    }
    
    return rows;
  }, [diagnosticData, searchTerm, categoryFilter]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredRows.length) return;
    
    const headers = [
      'Project', 'Part', 'Part Type', 'Lifecycle Category', 'Classification Reason',
      'Has Commitment', 'Has PO Line', 'Has Vendor Invoice', 'Has Installed',
      'Client Billing', 'Client Payment', 'Financial Role',
      'Missing Dependencies', 'Dropped By Filter'
    ];
    
    const csvRows = filteredRows.map(r => [
      r.project_name,
      r.part_name,
      r.part_type,
      r.lifecycle_category,
      `"${r.classification_reason}"`,
      r.has_commitment,
      r.has_purchase_line_item,
      r.has_vendor_invoice,
      r.has_installed_part,
      r.resolver_client_billing_status,
      r.resolver_client_payment_status,
      r.resolver_financial_role,
      `"${r.missing_dependencies?.join('; ') || ''}"`,
      `"${r.dropped_by_filter?.join('; ') || ''}"`
    ].join(','));
    
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifecycle-diagnostic-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRowStatusColor = (row) => {
    if (row.lifecycle_category === 'UNCATEGORIZED') return ROW_STATUS_COLORS.UNCATEGORIZED;
    if (!row.resolver_present) return ROW_STATUS_COLORS.MISSING_RESOLVER;
    if (!row.has_commitment) return ROW_STATUS_COLORS.MISSING_COMMITMENT;
    if (row.dropped_by_filter?.length > 0) return ROW_STATUS_COLORS.DROPPED_BY_FILTER;
    return ROW_STATUS_COLORS.FULLY_CLASSIFIED;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-blue-400" />
            Parts Lifecycle Diagnostic
          </h1>
          <p className="text-gray-400 mt-1">
            Read-only audit of why parts appear or don't appear in lifecycle workflows
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportCSV}
            disabled={!filteredRows.length}
            className="border-gray-700 gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button 
            onClick={() => refetch()} 
            variant="outline" 
            className="border-gray-700 gap-2"
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <DiagnosticKPIs 
        totals={diagnosticData?.totals} 
        coverageStats={diagnosticData?.coverage_stats} 
      />

      {/* Filters */}
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts or projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700"
              />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="bg-gray-900/50 border-gray-700">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="bg-gray-900/50 border-gray-700">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(LIFECYCLE_COLORS).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.text}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-gray-400">
              {filteredRows.length} rows shown
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-l-4 border-l-green-500 bg-gray-800" />
          <span className="text-gray-400">Fully Classified</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-l-4 border-l-red-500 bg-gray-800" />
          <span className="text-gray-400">Uncategorized</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-l-4 border-l-orange-500 bg-gray-800" />
          <span className="text-gray-400">Missing Resolver</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-l-4 border-l-blue-500 bg-gray-800" />
          <span className="text-gray-400">Dropped by Filter</span>
        </div>
      </div>

      {/* Table */}
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-500" />
              <p className="text-gray-400">Running lifecycle diagnostic...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-700 hover:bg-transparent">
                  <TableHead className="text-gray-400 text-xs">Project</TableHead>
                  <TableHead className="text-gray-400 text-xs">Part</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Resolver</TableHead>
                  <TableHead className="text-gray-400 text-xs">Category</TableHead>
                  <TableHead className="text-gray-400 text-xs">Missing</TableHead>
                  <TableHead className="text-gray-400 text-xs">Dropped By</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Commit</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Vendor</TableHead>
                  <TableHead className="text-gray-400 text-xs text-center">Install</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, idx) => (
                  <TableRow 
                    key={`${row.commitment_id}-${idx}`}
                    className={cn(
                      "border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer",
                      getRowStatusColor(row)
                    )}
                    onClick={() => setSelectedRow(row)}
                  >
                    <TableCell className="text-white text-sm">{row.project_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-white text-sm">{row.part_name}</p>
                          <p className="text-xs text-gray-500">{row.part_type}</p>
                        </div>
                        {row.part_type_missing && (
                          <Badge className="bg-amber-600/30 text-amber-400 text-xs shrink-0">⚠</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {row.resolver_present ? 
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : 
                        <XCircle className="w-4 h-4 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", LIFECYCLE_COLORS[row.lifecycle_category]?.bg || 'bg-gray-600')}>
                        {LIFECYCLE_COLORS[row.lifecycle_category]?.text || row.lifecycle_category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.missing_dependencies?.length > 0 ? (
                        <Badge className="bg-orange-600/30 text-orange-300 text-xs">
                          {row.missing_dependencies.length}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {row.dropped_by_filter?.length > 0 ? (
                        <Badge className="bg-blue-600/30 text-blue-300 text-xs">
                          {row.dropped_by_filter.length}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.has_commitment ? 
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : 
                        <XCircle className="w-4 h-4 text-gray-500 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.has_purchase_line_item ? 
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : 
                        <XCircle className="w-4 h-4 text-gray-500 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.has_installed_part ? 
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : 
                        <XCircle className="w-4 h-4 text-gray-500 mx-auto" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <DiagnosticDetailDrawer
        row={selectedRow}
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}