import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { creditKeys, invoiceKeys, projectKeys, financialSnapshotKeys } from "@/components/financial/queryKeyFactories";
import { FinancialDiagnosticsPanel } from "@/components/financial/CanonicalFinancialDisplay";

/**
 * PHASE 8 REFACTORED — Credit Ledger Page
 * 
 * Read-only view of project credit balances.
 * Now includes canonical financial snapshot integration.
 * Shows source invoice, amount, remaining, and application status.
 */
export default function CreditLedger() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Fetch credit ledger entries - uses factory key
  const { data: credits = [], isLoading, refetch } = useQuery({
    queryKey: creditKeys.ledger(),
    queryFn: () => base44.entities.ProjectCreditLedger.list(),
    staleTime: 30000,
  });

  // Fetch projects for names - uses factory key
  const { data: projects = [] } = useQuery({
    queryKey: projectKeys.list(),
    queryFn: () => base44.entities.Project.list(),
    staleTime: 60000,
  });

  // Fetch invoices for source/applied invoice info - uses factory key
  const { data: invoices = [] } = useQuery({
    queryKey: invoiceKeys.all(),
    queryFn: () => base44.entities.ProjectInvoice.list(),
    staleTime: 30000,
  });
  
  // PHASE 6: Fetch credit allocations - uses factory key
  const { data: allocations = [] } = useQuery({
    queryKey: creditKeys.all(),
    queryFn: () => base44.entities.CreditAllocation.filter({ is_reversed: false }),
    staleTime: 30000,
  });

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const invoiceMap = Object.fromEntries(invoices.map((i) => [i.id, i]));

  // Build allocation count by ledger
  const allocationsByLedger = useMemo(() => {
    const map = {};
    for (const alloc of allocations) {
      if (!map[alloc.credit_ledger_id]) {
        map[alloc.credit_ledger_id] = { count: 0, total: 0 };
      }
      map[alloc.credit_ledger_id].count += 1;
      map[alloc.credit_ledger_id].total += alloc.amount_applied || 0;
    }
    return map;
  }, [allocations]);

  // Enrich credits with project and invoice names
  const enrichedCredits = useMemo(() => {
    return credits.map((credit) => {
      const project = projectMap[credit.project_id];
      const sourceInvoice = invoiceMap[credit.source_invoice_id];
      const appliedInvoice = credit.applied_to_invoice_id
        ? invoiceMap[credit.applied_to_invoice_id]
        : null;
      const allocationInfo = allocationsByLedger[credit.id] || { count: 0, total: 0 };

      return {
        ...credit,
        project_name: project?.name || "Unknown Project",
        source_invoice_number: sourceInvoice?.qb_invoice_number || "—",
        applied_invoice_number: appliedInvoice?.qb_invoice_number || null,
        allocation_count: allocationInfo.count,
        allocation_total: allocationInfo.total,
        status:
          credit.remaining_amount === 0
            ? "applied"
            : credit.remaining_amount < credit.credit_amount
            ? "partial"
            : "available",
      };
    });
  }, [credits, projectMap, invoiceMap, allocationsByLedger]);

  // Filter credits
  const filteredCredits = useMemo(() => {
    return enrichedCredits.filter((credit) => {
      // Project filter
      if (projectFilter !== "all" && credit.project_id !== projectFilter) return false;

      // Status filter
      if (statusFilter !== "all" && credit.status !== statusFilter) return false;

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesProject = credit.project_name?.toLowerCase().includes(search);
        const matchesSource = credit.source_invoice_number?.toLowerCase().includes(search);
        if (!matchesProject && !matchesSource) return false;
      }

      return true;
    });
  }, [enrichedCredits, statusFilter, searchTerm, projectFilter]);

  // Get unique projects with credits
  const projectsWithCredits = useMemo(() => {
    const uniqueProjects = new Map();
    for (const credit of enrichedCredits) {
      if (!uniqueProjects.has(credit.project_id)) {
        uniqueProjects.set(credit.project_id, credit.project_name);
      }
    }
    return Array.from(uniqueProjects.entries()).map(([id, name]) => ({ id, name }));
  }, [enrichedCredits]);

  // Calculate summary
  const summary = useMemo(() => {
    return {
      total_credits: credits.length,
      total_created: credits.reduce((sum, c) => sum + (c.credit_amount || 0), 0),
      total_remaining: credits.reduce((sum, c) => sum + (c.remaining_amount || 0), 0),
      total_applied: credits.reduce(
        (sum, c) => sum + ((c.credit_amount || 0) - (c.remaining_amount || 0)),
        0
      ),
      available_count: enrichedCredits.filter((c) => c.status === "available").length,
      applied_count: enrichedCredits.filter((c) => c.status === "applied").length,
    };
  }, [credits, enrichedCredits]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: creditKeys.ledger() });
    queryClient.invalidateQueries({ queryKey: invoiceKeys.all() });
    queryClient.invalidateQueries({ queryKey: creditKeys.all() });
  };

  const getStatusBadge = (status) => {
    const config = {
      available: { label: "Available", className: "bg-green-600/20 text-green-400" },
      partial: { label: "Partial", className: "bg-amber-600/20 text-amber-400" },
      applied: { label: "Applied", className: "bg-gray-600/20 text-gray-400" },
    };
    const c = config[status] || config.available;
    return <Badge className={cn("text-xs", c.className)}>{c.label}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-green-400" />
            Credit Ledger
          </h1>
          <p className="text-gray-400 text-sm">
            Project credit balances from overpayments
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400 uppercase">Total Created</span>
            </div>
            <p className="text-2xl font-bold font-mono text-white">
              {formatCurrencyUSD(summary.total_created)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-900/20 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-400 uppercase">Available</span>
            </div>
            <p className="text-2xl font-bold font-mono text-green-300">
              {formatCurrencyUSD(summary.total_remaining)}
            </p>
            <p className="text-xs text-gray-500">{summary.available_count} credits</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400 uppercase">Applied</span>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-300">
              {formatCurrencyUSD(summary.total_applied)}
            </p>
            <p className="text-xs text-gray-500">{summary.applied_count} credits</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400 uppercase">Total Entries</span>
            </div>
            <p className="text-2xl font-bold text-gray-300">{summary.total_credits}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search by project or invoice..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-900/50 border-gray-700"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[220px] bg-gray-900/50 border-gray-700">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projectsWithCredits.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-gray-900/50 border-gray-700">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="gap-1"
        >
          {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Diagnostics
        </Button>
      </div>

      {/* Financial Diagnostics Panel (collapsible) */}
      {showDiagnostics && projectFilter !== "all" && (
        <FinancialDiagnosticsPanel projectId={projectFilter} />
      )}
      {showDiagnostics && projectFilter === "all" && (
        <div className="p-4 bg-gray-800/50 rounded border border-gray-700 text-gray-400 text-sm">
          Select a project to view financial diagnostics.
        </div>
      )}

      {/* Credits Table */}
      <Card className="bg-gray-900/50 border-gray-800">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-400">Project</TableHead>
              <TableHead className="text-gray-400">Source Invoice</TableHead>
              <TableHead className="text-gray-400 text-right">Credit Created</TableHead>
              <TableHead className="text-gray-400 text-right">Remaining</TableHead>
              <TableHead className="text-gray-400">Applied To</TableHead>
              <TableHead className="text-gray-400">Status</TableHead>
              <TableHead className="text-gray-400">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCredits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  {isLoading ? "Loading..." : "No credits found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredCredits.map((credit) => (
                <TableRow key={credit.id} className="border-gray-800 hover:bg-gray-800/30">
                  <TableCell>
                    <p className="text-white font-medium">{credit.project_name}</p>
                  </TableCell>
                  <TableCell className="font-mono text-gray-300">
                    {credit.source_invoice_number}
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-300">
                    {formatCurrencyUSD(credit.credit_amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {credit.allocation_count > 0 ? (
                      <div className="text-right">
                        <span className="text-amber-400">
                          {formatCurrencyUSD(credit.allocation_total)}
                        </span>
                        <span className="text-gray-500 text-xs ml-1">
                          ({credit.allocation_count} alloc)
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={cn(
                        credit.remaining_amount > 0 ? "text-green-400" : "text-gray-500"
                      )}
                    >
                      {formatCurrencyUSD(credit.remaining_amount)}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(credit.status)}</TableCell>
                  <TableCell className="text-gray-400">
                    {format(parseISO(credit.created_date), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Info Notice */}
      <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
        <p className="text-sm text-blue-300">
          <strong>Note:</strong> Credits are automatically created from invoice overpayments and
          applied to subsequent invoices at payment time. This ledger is read-only.
        </p>
      </div>
    </div>
  );
}