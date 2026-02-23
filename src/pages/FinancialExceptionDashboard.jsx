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
  DollarSign, 
  Truck, 
  TrendingUp, 
  Package,
  CheckCircle2,
  Search,
  RefreshCw,
  Loader2,
  Calendar,
  Filter,
  ExternalLink,
  Clock,
  FileText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import FinancialDetailDrawer from "@/components/financial/FinancialDetailDrawer";
import { useFinancialStatusBatch } from "@/components/financial/useFinancialStatus";
import InvoiceWorkbench from "@/components/financial/InvoiceWorkbench";
import { projectKeys } from "@/components/financial/queryKeyFactories";

// ============================================
// CONSTANTS
// ============================================

const EXCEPTION_TYPES = {
  INSTALLED_NOT_BILLED: 'INSTALLED_NOT_BILLED',
  VENDOR_PAID_CLIENT_UNPAID: 'VENDOR_PAID_CLIENT_UNPAID',
  MARGIN_INCOMPLETE: 'MARGIN_INCOMPLETE',
  INVENTORY_NO_COMMITMENT: 'INVENTORY_NO_COMMITMENT',
};

const EXCEPTION_CONFIG = {
  [EXCEPTION_TYPES.INSTALLED_NOT_BILLED]: {
    label: 'Installed But Not Billed',
    shortLabel: 'Not Billed',
    icon: DollarSign,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-600',
    borderColor: 'border-yellow-600/30',
  },
  [EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID]: {
    label: 'Vendor Paid, Client Unpaid',
    shortLabel: 'Cash Flow Risk',
    icon: Truck,
    color: 'text-red-400',
    bgColor: 'bg-red-600',
    borderColor: 'border-red-600/30',
  },
  [EXCEPTION_TYPES.MARGIN_INCOMPLETE]: {
    label: 'Margin Incomplete',
    shortLabel: 'Margin Gap',
    icon: TrendingUp,
    color: 'text-orange-400',
    bgColor: 'bg-orange-600',
    borderColor: 'border-orange-600/30',
  },
  [EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT]: {
    label: 'No Commitment Coverage',
    shortLabel: 'No Coverage',
    icon: Package,
    color: 'text-purple-400',
    bgColor: 'bg-purple-600',
    borderColor: 'border-purple-600/30',
  },
};

const SEVERITY_CONFIG = {
  HIGH: { label: 'High', color: 'bg-red-600', textColor: 'text-red-400' },
  MEDIUM: { label: 'Medium', color: 'bg-orange-600', textColor: 'text-orange-400' },
  LOW: { label: 'Low', color: 'bg-yellow-600', textColor: 'text-yellow-400' },
};

const FINANCIAL_ROLE_LABELS = {
  VENDOR_MARGIN: 'Vendor Margin',
  INTERNAL_MANUFACTURING: 'Internal Mfg',
  LABOR_ONLY: 'Labor Only',
  ASSET_RECOVERY: 'Asset Recovery',
  NON_BILLABLE: 'Non-Billable',
};

// ============================================
// KPI CARD COMPONENT
// ============================================

function KPICard({ icon: Icon, label, value, subValue, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-4 bg-gray-900/50 rounded-lg border border-gray-800 text-left w-full transition-all",
        onClick && "hover:border-gray-700 cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-5 h-5", color)} />
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {subValue && <span className="text-sm text-gray-500">{subValue}</span>}
      </div>
    </button>
  );
}

// ============================================
// EXCEPTION TABLE COMPONENT
// ============================================

function ExceptionTable({ exceptions, type, onRowClick }) {
  const config = EXCEPTION_CONFIG[type];
  
  if (!exceptions || exceptions.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
        <p className="text-green-400 font-medium">No {config.label} Exceptions</p>
        <p className="text-gray-500 text-sm">All items in this category are compliant</p>
      </div>
    );
  }

  const columns = {
    [EXCEPTION_TYPES.INSTALLED_NOT_BILLED]: ['Project', 'Part', 'Qty', 'Install Date', 'Days', 'Severity', 'Role'],
    [EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID]: ['Project', 'Part', 'Vendor Cost', 'Client Status', 'Days', 'Severity', 'Role'],
    [EXCEPTION_TYPES.MARGIN_INCOMPLETE]: ['Project', 'Part', 'Margin State', 'Vendor', 'Client', 'Severity', 'Role'],
    [EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT]: ['Project', 'Part', 'Qty', 'Install Date', 'Task', 'Severity'],
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-gray-700 hover:bg-transparent">
          {columns[type].map(col => (
            <TableHead key={col} className="text-gray-400 text-xs">{col}</TableHead>
          ))}
          <TableHead className="text-gray-400 text-xs w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {exceptions.map((ex, idx) => (
          <TableRow 
            key={`${ex.type}-${idx}`}
            className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
            onClick={() => onRowClick(ex)}
          >
            <TableCell>
              <Link 
                to={`${createPageUrl('ProjectDetail')}?id=${ex.project_id}`}
                className="text-blue-400 hover:text-blue-300 text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {ex.project_name}
              </Link>
            </TableCell>
            <TableCell>
              <div>
                <p className="text-white text-sm">{ex.part_name}</p>
              </div>
            </TableCell>
            
            {type === EXCEPTION_TYPES.INSTALLED_NOT_BILLED && (
              <>
                <TableCell className="text-white text-sm">{ex.installed_qty}</TableCell>
                <TableCell className="text-gray-400 text-sm">
                  {ex.installed_date ? new Date(ex.installed_date).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "text-sm font-medium",
                    ex.days_since_event > 14 ? "text-red-400" : 
                    ex.days_since_event > 7 ? "text-orange-400" : "text-yellow-400"
                  )}>
                    {ex.days_since_event}d
                  </span>
                </TableCell>
              </>
            )}
            
            {type === EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID && (
              <>
                <TableCell className="text-green-400 text-sm font-medium">
                  ${(ex.vendor_cost || 0).toFixed(2)}
                </TableCell>
                <TableCell>
                  <Badge className="bg-yellow-600 text-white text-xs">
                    {ex.client_billing_status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "text-sm font-medium",
                    ex.days_since_event > 30 ? "text-red-400" : 
                    ex.days_since_event > 14 ? "text-orange-400" : "text-yellow-400"
                  )}>
                    {ex.days_since_event}d
                  </span>
                </TableCell>
              </>
            )}
            
            {type === EXCEPTION_TYPES.MARGIN_INCOMPLETE && (
              <>
                <TableCell>
                  <Badge className="bg-orange-600 text-white text-xs">
                    {ex.margin_state}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={cn(
                    "text-xs",
                    ex.vendor_payment_status === 'PAID' ? "bg-green-600" : "bg-gray-600"
                  )}>
                    {ex.vendor_payment_status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={cn(
                    "text-xs",
                    ex.client_billing_status === 'PAID' ? "bg-green-600" : 
                    ex.client_billing_status === 'INVOICED' ? "bg-blue-600" : "bg-yellow-600"
                  )}>
                    {ex.client_billing_status}
                  </Badge>
                </TableCell>
              </>
            )}
            
            {type === EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT && (
              <>
                <TableCell className="text-white text-sm">{ex.installed_qty}</TableCell>
                <TableCell className="text-gray-400 text-sm">
                  {ex.installed_date ? new Date(ex.installed_date).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell className="text-gray-400 text-sm">
                  {ex.task_id ? `Task ${ex.task_id.slice(0, 8)}` : '-'}
                </TableCell>
              </>
            )}
            
            <TableCell>
              <Badge className={cn("text-xs", SEVERITY_CONFIG[ex.severity]?.color || "bg-gray-600")}>
                {ex.severity}
              </Badge>
            </TableCell>
            
            {type !== EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT && (
              <TableCell>
                <span className="text-xs text-gray-400">
                  {FINANCIAL_ROLE_LABELS[ex.financial_role] || ex.financial_role}
                </span>
              </TableCell>
            )}
            
            <TableCell>
              <ExternalLink className="w-4 h-4 text-gray-500" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function FinancialExceptionDashboard() {
  const [viewMode, setViewMode] = useState('exceptions'); // 'exceptions' | 'workbench'
  const [activeTab, setActiveTab] = useState(EXCEPTION_TYPES.INSTALLED_NOT_BILLED);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [financialRoleFilter, setFinancialRoleFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerContext, setDrawerContext] = useState(null);

  // Fetch exceptions from backend
  const { data: exceptionData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['financialExceptions'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getFinancialExceptions', {});
      return response.data;
    },
    staleTime: 60000, // 1 minute
  });

  // Fetch projects for filter dropdown - uses factory key
  const { data: projects = [] } = useQuery({
    queryKey: projectKeys.list(),
    queryFn: () => base44.entities.Project.list(),
  });

  // Build financial contexts for drawer
  const financialContexts = useMemo(() => {
    if (!drawerContext?.part_id) return [];
    return [{
      part_id: drawerContext.part_id,
      project_id: drawerContext.project_id,
      commitment_id: drawerContext.commitment_id,
    }];
  }, [drawerContext]);

  const { data: financialStatuses = [] } = useFinancialStatusBatch(financialContexts, {
    enabled: drawerOpen && financialContexts.length > 0,
  });

  // Filter exceptions
  const filteredExceptions = useMemo(() => {
    if (!exceptionData?.exceptions) return {};
    
    let filtered = exceptionData.exceptions;
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.part_name?.toLowerCase().includes(search) ||
        e.project_name?.toLowerCase().includes(search)
      );
    }
    
    if (projectFilter !== 'all') {
      filtered = filtered.filter(e => e.project_id === projectFilter);
    }
    
    if (severityFilter !== 'all') {
      filtered = filtered.filter(e => e.severity === severityFilter);
    }
    
    if (financialRoleFilter !== 'all') {
      filtered = filtered.filter(e => e.financial_role === financialRoleFilter);
    }
    
    // Group by type
    return {
      [EXCEPTION_TYPES.INSTALLED_NOT_BILLED]: filtered.filter(e => e.type === EXCEPTION_TYPES.INSTALLED_NOT_BILLED),
      [EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID]: filtered.filter(e => e.type === EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID),
      [EXCEPTION_TYPES.MARGIN_INCOMPLETE]: filtered.filter(e => e.type === EXCEPTION_TYPES.MARGIN_INCOMPLETE),
      [EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT]: filtered.filter(e => e.type === EXCEPTION_TYPES.INVENTORY_NO_COMMITMENT),
    };
  }, [exceptionData, searchTerm, projectFilter, severityFilter, financialRoleFilter]);

  const handleRowClick = (exception) => {
    setDrawerContext(exception);
    setDrawerOpen(true);
  };

  const kpis = exceptionData?.kpis || {
    total_exceptions: 0,
    by_type: {},
    by_severity: {},
    vendor_cost_exposure: 0,
    margin_completion_rate: 100,
  };

  const totalFiltered = Object.values(filteredExceptions).flat().length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {viewMode === 'exceptions' ? (
              <AlertTriangle className="w-7 h-7 text-yellow-400" />
            ) : (
              <FileText className="w-7 h-7 text-green-400" />
            )}
            {viewMode === 'exceptions' ? 'Financial Exceptions' : 'Invoice Workbench'}
          </h1>
          <p className="text-gray-400 mt-1">
            {viewMode === 'exceptions' 
              ? 'Identify revenue leakage, cash flow risks, and incomplete margin chains'
              : 'Select items, create invoice batches, and export to QuickBooks'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-1 flex">
            <button
              onClick={() => setViewMode('exceptions')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                viewMode === 'exceptions' 
                  ? "bg-yellow-600 text-white" 
                  : "text-gray-400 hover:text-white"
              )}
            >
              <AlertTriangle className="w-4 h-4" />
              Exceptions
            </button>
            <button
              onClick={() => setViewMode('workbench')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                viewMode === 'workbench' 
                  ? "bg-green-600 text-white" 
                  : "text-gray-400 hover:text-white"
              )}
            >
              <FileText className="w-4 h-4" />
              Invoice Workbench
            </button>
          </div>
          {viewMode === 'exceptions' && (
            <Button 
              onClick={() => refetch()} 
              variant="outline" 
              className="border-gray-700 gap-2"
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Workbench Mode */}
      {viewMode === 'workbench' && (
        <>
          <InvoiceWorkbench onRowClick={(item) => {
            setDrawerContext({
              ...item,
              lifecycleContext: {
                lifecycle_category: item.lifecycle_category,
                ordering_safety: item.ordering_safety,
                order_reference: item.order_reference,
                recommended_action: item.recommended_action,
              }
            });
            setDrawerOpen(true);
          }} />
          
          {/* Financial Detail Drawer */}
          <FinancialDetailDrawer
            isOpen={drawerOpen}
            onClose={() => {
              setDrawerOpen(false);
              setDrawerContext(null);
            }}
            partId={drawerContext?.part_id}
            projectId={drawerContext?.project_id}
            financialStatus={financialStatuses[0] || null}
            lifecycleContext={drawerContext?.lifecycleContext}
          />
        </>
      )}

      {/* Exceptions Mode */}
      {viewMode === 'exceptions' && (
        <>
      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          icon={AlertTriangle}
          label="Total Exceptions"
          value={kpis.total_exceptions}
          color="text-yellow-400"
        />
        <KPICard
          icon={DollarSign}
          label="Unbilled Installs"
          value={kpis.by_type?.installed_not_billed || 0}
          color="text-yellow-400"
          onClick={() => setActiveTab(EXCEPTION_TYPES.INSTALLED_NOT_BILLED)}
        />
        <KPICard
          icon={Truck}
          label="Vendor Exposure"
          value={`$${(kpis.vendor_cost_exposure || 0).toFixed(0)}`}
          color="text-red-400"
          onClick={() => setActiveTab(EXCEPTION_TYPES.VENDOR_PAID_CLIENT_UNPAID)}
        />
        <KPICard
          icon={TrendingUp}
          label="Margin Incomplete"
          value={kpis.by_type?.margin_incomplete || 0}
          color="text-orange-400"
          onClick={() => setActiveTab(EXCEPTION_TYPES.MARGIN_INCOMPLETE)}
        />
        <KPICard
          icon={CheckCircle2}
          label="Margin Complete"
          value={`${kpis.margin_completion_rate || 100}%`}
          color="text-green-400"
        />
      </div>

      {/* Severity Breakdown */}
      <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-6">
            <span className="text-xs text-gray-400 uppercase tracking-wide">By Severity:</span>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSeverityFilter(severityFilter === 'HIGH' ? 'all' : 'HIGH')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-lg transition-colors",
                  severityFilter === 'HIGH' ? "bg-red-600/30" : "hover:bg-gray-800"
                )}
              >
                <div className="w-3 h-3 rounded-full bg-red-600" />
                <span className="text-white font-medium">{kpis.by_severity?.high || 0}</span>
                <span className="text-gray-400 text-sm">High</span>
              </button>
              <button 
                onClick={() => setSeverityFilter(severityFilter === 'MEDIUM' ? 'all' : 'MEDIUM')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-lg transition-colors",
                  severityFilter === 'MEDIUM' ? "bg-orange-600/30" : "hover:bg-gray-800"
                )}
              >
                <div className="w-3 h-3 rounded-full bg-orange-600" />
                <span className="text-white font-medium">{kpis.by_severity?.medium || 0}</span>
                <span className="text-gray-400 text-sm">Medium</span>
              </button>
              <button 
                onClick={() => setSeverityFilter(severityFilter === 'LOW' ? 'all' : 'LOW')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-lg transition-colors",
                  severityFilter === 'LOW' ? "bg-yellow-600/30" : "hover:bg-gray-800"
                )}
              >
                <div className="w-3 h-3 rounded-full bg-yellow-600" />
                <span className="text-white font-medium">{kpis.by_severity?.low || 0}</span>
                <span className="text-gray-400 text-sm">Low</span>
              </button>
            </div>
            {severityFilter !== 'all' && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSeverityFilter('all')}
                className="text-gray-400"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="bg-black/40 backdrop-blur-xl border border-gray-800">
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
            <Select value={financialRoleFilter} onValueChange={setFinancialRoleFilter}>
              <SelectTrigger className="bg-gray-900/50 border-gray-700">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Financial Roles</SelectItem>
                <SelectItem value="VENDOR_MARGIN">Vendor Margin</SelectItem>
                <SelectItem value="INTERNAL_MANUFACTURING">Internal Mfg</SelectItem>
                <SelectItem value="LABOR_ONLY">Labor Only</SelectItem>
                <SelectItem value="ASSET_RECOVERY">Asset Recovery</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Filter className="w-4 h-4" />
              <span>{totalFiltered} exceptions shown</span>
              {exceptionData?.last_scan_at && (
                <span className="ml-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(exceptionData.last_scan_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exception Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-900/50 border border-gray-700 p-1">
          {Object.entries(EXCEPTION_CONFIG).map(([type, config]) => {
            const Icon = config.icon;
            const count = filteredExceptions[type]?.length || 0;
            return (
              <TabsTrigger 
                key={type} 
                value={type}
                className={cn(
                  "data-[state=active]:bg-gray-800 gap-2",
                  count > 0 && `data-[state=active]:${config.color}`
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{config.shortLabel}</span>
                {count > 0 && (
                  <Badge className={cn("text-xs", config.bgColor)}>{count}</Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {isLoading ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-gray-800 mt-4">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-500" />
              <p className="text-gray-400">Scanning for financial exceptions...</p>
            </CardContent>
          </Card>
        ) : kpis.total_exceptions === 0 ? (
          <Card className="bg-black/40 backdrop-blur-xl border border-green-900/30 mt-4">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-xl font-bold text-green-400 mb-2">No Financial Exceptions Detected</h3>
              <p className="text-gray-400 mb-4">All financial chains are complete and compliant</p>
              {exceptionData?.last_scan_at && (
                <p className="text-xs text-gray-500">
                  Last scanned: {new Date(exceptionData.last_scan_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          Object.entries(EXCEPTION_CONFIG).map(([type, config]) => (
            <TabsContent key={type} value={type} className="mt-4">
              <Card className={cn("bg-black/40 backdrop-blur-xl border", config.borderColor)}>
                <CardHeader className="border-b border-gray-800 p-4">
                  <div className="flex items-center gap-3">
                    <config.icon className={cn("w-5 h-5", config.color)} />
                    <CardTitle className="text-white">{config.label}</CardTitle>
                    <Badge className={config.bgColor}>
                      {filteredExceptions[type]?.length || 0}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ExceptionTable 
                    exceptions={filteredExceptions[type]} 
                    type={type}
                    onRowClick={handleRowClick}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          ))
        )}
      </Tabs>

      {/* Financial Detail Drawer */}
      <FinancialDetailDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerContext(null);
        }}
        partId={drawerContext?.part_id}
        projectId={drawerContext?.project_id}
        financialStatus={financialStatuses[0] || null}
      />
        </>
      )}
    </div>
  );
}