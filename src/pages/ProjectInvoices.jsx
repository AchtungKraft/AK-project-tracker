import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  Search,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  DollarSign,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import CreateProjectInvoiceModal from "@/components/financial/CreateProjectInvoiceModal";
import ProjectInvoiceDetailDrawer from "@/components/financial/ProjectInvoiceDetailDrawer";

export default function ProjectInvoices() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("draft");
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  // Fetch invoices view
  const { data: invoicesData, isLoading, refetch } = useQuery({
    queryKey: ["projectInvoicesView"],
    queryFn: async () => {
      const response = await base44.functions.invoke("getProjectInvoicesView", {});
      return response.data;
    },
    staleTime: 30000,
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 60000,
  });

  const invoices = invoicesData?.invoices || [];
  const creditBalances = invoicesData?.credit_balances || {};
  const summary = invoicesData?.summary || {};

  // Filter invoices by tab, search, and project
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Tab filter
      if (inv.status !== activeTab) return false;

      // Project filter
      if (projectFilter !== "all" && inv.project_id !== projectFilter) return false;

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesProject = inv.project_name?.toLowerCase().includes(search);
        const matchesClient = inv.client_name?.toLowerCase().includes(search);
        const matchesQB = inv.qb_invoice_number?.toLowerCase().includes(search);
        if (!matchesProject && !matchesClient && !matchesQB) return false;
      }

      return true;
    });
  }, [invoices, activeTab, projectFilter, searchTerm]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["projectInvoicesView"] });
    refetch();
  };

  const handleInvoiceCreated = () => {
    setShowCreateModal(false);
    handleRefresh();
  };

  const getInvoiceTypeBadge = (type) => {
    const config = {
      deposit: { label: "Deposit", className: "bg-blue-600 text-white" },
      progress: { label: "Progress", className: "bg-purple-600 text-white" },
      final: { label: "Final", className: "bg-green-600 text-white" },
    };
    const c = config[type] || config.progress;
    return <Badge className={cn("text-xs", c.className)}>{c.label}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Project Invoices</h1>
          <p className="text-gray-400 text-sm">
            Manage deposits, progress billing, and final invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400 uppercase">Draft</span>
            </div>
            <p className="text-2xl font-bold text-gray-300">{summary.draft_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-900/20 border-purple-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-400 uppercase">Sent</span>
            </div>
            <p className="text-2xl font-bold text-purple-300">{summary.sent_count || 0}</p>
            <p className="text-xs text-gray-500">
              {formatCurrencyUSD(summary.total_balance_due || 0)} outstanding
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-900/20 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-400 uppercase">Paid</span>
            </div>
            <p className="text-2xl font-bold text-green-300">{summary.paid_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-900/20 border-amber-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-gray-400 uppercase">Overdue</span>
            </div>
            <p className="text-2xl font-bold text-amber-300">{summary.overdue_count || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search projects, clients, or QB#..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-900/50 border-gray-700"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[200px] bg-gray-900/50 border-gray-700">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-800/50">
          <TabsTrigger value="draft" className="gap-2">
            <FileText className="w-4 h-4" />
            Draft
            <Badge variant="secondary" className="ml-1">
              {summary.draft_count || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Clock className="w-4 h-4" />
            Sent
            <Badge variant="secondary" className="ml-1">
              {summary.sent_count || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="paid" className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Paid
            <Badge variant="secondary" className="ml-1">
              {summary.paid_count || 0}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card className="bg-gray-900/50 border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400">Project</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-gray-400">QB #</TableHead>
                  <TableHead className="text-gray-400 text-right">Subtotal</TableHead>
                  <TableHead className="text-gray-400 text-right">Credit</TableHead>
                  <TableHead className="text-gray-400 text-right">Balance Due</TableHead>
                  <TableHead className="text-gray-400">Due Date</TableHead>
                  <TableHead className="text-gray-400">Flags</TableHead>
                  <TableHead className="text-gray-400"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No invoices in this tab
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="border-gray-800 hover:bg-gray-800/30 cursor-pointer"
                      onClick={() => setSelectedInvoiceId(inv.id)}
                    >
                      <TableCell>
                        <div>
                          <p className="text-white font-medium">{inv.project_name}</p>
                          {inv.client_name && (
                            <p className="text-xs text-gray-500">{inv.client_name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getInvoiceTypeBadge(inv.invoice_type)}</TableCell>
                      <TableCell className="text-gray-300 font-mono">
                        {inv.qb_invoice_number || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-300">
                        {formatCurrencyUSD(inv.subtotal || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {inv.credit_applied > 0 ? (
                          <span className="text-green-400">
                            -{formatCurrencyUSD(inv.credit_applied)}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-white font-medium">
                        {formatCurrencyUSD(inv.balance_due || 0)}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {inv.due_date ? format(parseISO(inv.due_date), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {inv.flags?.overdue && (
                            <Badge className="bg-red-600/20 text-red-400 text-xs">
                              Overdue
                            </Badge>
                          )}
                          {inv.flags?.missing_qb_fields && (
                            <Badge className="bg-amber-600/20 text-amber-400 text-xs">
                              Missing QB
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <CreateProjectInvoiceModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleInvoiceCreated}
          projects={projects}
          creditBalances={creditBalances}
        />
      )}

      {/* Invoice Detail Drawer */}
      {selectedInvoiceId && (
        <ProjectInvoiceDetailDrawer
          invoiceId={selectedInvoiceId}
          open={!!selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
          onUpdated={handleRefresh}
        />
      )}
    </div>
  );
}