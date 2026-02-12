import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  Package,
  CheckCircle2,
  Search,
  RefreshCw,
  Loader2,
  Filter,
  FileText,
  Upload,
  X,
  AlertTriangle,
  Clock,
  ExternalLink,
  FolderOpen,
  Users,
  Layers,
  ListChecks,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ============================================
// CONSTANTS
// ============================================

const BATCH_MODES = {
  MANUAL: { label: 'Manual', icon: ListChecks, description: 'Create single batch with selected items' },
  BY_PROJECT: { label: 'By Project', icon: FolderOpen, description: 'Split into separate batches per project' },
  BY_CLIENT: { label: 'By Client', icon: Users, description: 'Group batches by client name' },
};

const FINANCIAL_ROLE_LABELS = {
  VENDOR_MARGIN: 'Vendor Margin',
  INTERNAL_MANUFACTURING: 'Internal Mfg',
  LABOR_ONLY: 'Labor Only',
  ASSET_RECOVERY: 'Asset Recovery',
  NON_BILLABLE: 'Non-Billable',
};

// ============================================
// BATCH BUILDER PANEL
// ============================================

function BatchBuilderPanel({ selectedItems, batchMode, setBatchMode, onCreateBatch, onClearSelection, isCreating }) {
  const selectedCount = selectedItems.length;
  const totalAmount = selectedItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
  
  // Preview batch grouping
  const batchPreview = useMemo(() => {
    if (batchMode === 'MANUAL') return [{ name: 'Manual Batch', count: selectedCount }];
    
    const groups = {};
    selectedItems.forEach(item => {
      const key = batchMode === 'BY_PROJECT' ? item.project_name : item.client_name || 'Unknown';
      if (!groups[key]) groups[key] = 0;
      groups[key]++;
    });
    
    return Object.entries(groups).map(([name, count]) => ({ name, count }));
  }, [selectedItems, batchMode]);

  if (selectedCount === 0) return null;

  return (
    <Card className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-700/50 sticky bottom-4">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Selection Summary */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge className="bg-green-600 text-lg px-3 py-1">{selectedCount}</Badge>
              <span className="text-white font-medium">Items Selected</span>
              <span className="text-green-400 font-bold text-lg">${totalAmount.toFixed(2)}</span>
            </div>
            
            {/* Batch Mode Selector */}
            <RadioGroup value={batchMode} onValueChange={setBatchMode} className="flex gap-4 mt-3">
              {Object.entries(BATCH_MODES).map(([mode, config]) => {
                const Icon = config.icon;
                return (
                  <div key={mode} className="flex items-center gap-2">
                    <RadioGroupItem value={mode} id={mode} />
                    <Label htmlFor={mode} className="flex items-center gap-1 text-gray-300 cursor-pointer">
                      <Icon className="w-4 h-4" />
                      {config.label}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
            
            {/* Batch Preview */}
            {batchPreview.length > 1 && (
              <div className="mt-2 text-xs text-gray-400">
                Will create {batchPreview.length} batches: {batchPreview.map(b => `${b.name} (${b.count})`).join(', ')}
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClearSelection} className="border-gray-600">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
            <Button 
              onClick={onCreateBatch} 
              disabled={isCreating}
              className="bg-green-600 hover:bg-green-700"
            >
              {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Create Batch
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// BATCH HISTORY PANEL
// ============================================

function BatchHistoryPanel({ onBatchClick }) {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['invoiceBatches'],
    queryFn: () => base44.entities.InvoiceBatch.list('-created_date', 20),
  });

  const statusColors = {
    draft: 'bg-gray-600',
    exported: 'bg-blue-600',
    invoiced: 'bg-green-600',
    voided: 'bg-red-600',
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-500" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>No batches created yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-64">
      <div className="space-y-2 p-2">
        {batches.map(batch => (
          <button
            key={batch.id}
            onClick={() => onBatchClick(batch)}
            className="w-full text-left p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-white font-medium text-sm">{batch.batch_name}</span>
              <Badge className={cn("text-xs", statusColors[batch.status] || 'bg-gray-600')}>
                {batch.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{batch.line_count || 0} items</span>
              <span>${(batch.total_amount || 0).toFixed(2)}</span>
              <span>{new Date(batch.created_date).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

// ============================================
// BATCH DETAIL MODAL
// ============================================

function BatchDetailModal({ batch, isOpen, onClose }) {
  const queryClient = useQueryClient();
  
  const { data: lines = [], isLoading: linesLoading } = useQuery({
    queryKey: ['batchLines', batch?.id],
    queryFn: () => base44.entities.InvoiceBatchLine.filter({ batch_id: batch.id }),
    enabled: isOpen && !!batch?.id,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('exportInvoiceBatchToQuickBooks', { batch_id: batch.id });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Batch exported successfully');
      queryClient.invalidateQueries({ queryKey: ['invoiceBatches'] });
      queryClient.invalidateQueries({ queryKey: ['batchLines', batch?.id] });
    },
    onError: (error) => {
      toast.error(error.message || 'Export failed');
    },
  });

  if (!batch) return null;

  const statusColors = {
    queued: 'bg-yellow-600',
    exported: 'bg-blue-600',
    failed: 'bg-red-600',
    invoiced: 'bg-green-600',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {batch.batch_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Batch Info */}
          <div className="grid grid-cols-3 gap-4 p-3 bg-gray-800/50 rounded-lg">
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <Badge className={cn("mt-1", statusColors[batch.status] || 'bg-gray-600')}>
                {batch.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-white font-bold">${(batch.total_amount || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">QB Export ID</p>
              <p className="text-white text-sm">{batch.qb_export_id || '-'}</p>
            </div>
          </div>
          
          {/* Lines */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">Line Items ({lines.length})</h4>
            {linesLoading ? (
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            ) : (
              <ScrollArea className="h-48">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-700">
                      <TableHead className="text-gray-400">Description</TableHead>
                      <TableHead className="text-gray-400 text-right">Qty</TableHead>
                      <TableHead className="text-gray-400 text-right">Price</TableHead>
                      <TableHead className="text-gray-400 text-right">Total</TableHead>
                      <TableHead className="text-gray-400">QB Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(line => (
                      <TableRow key={line.id} className="border-gray-800">
                        <TableCell className="text-white text-sm">{line.description}</TableCell>
                        <TableCell className="text-right text-gray-300">{line.qty}</TableCell>
                        <TableCell className="text-right text-gray-300">${(line.unit_price || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-green-400">${(line.line_total || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", statusColors[line.qb_status] || 'bg-gray-600')}>
                            {line.qb_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {batch.status === 'draft' && (
            <Button 
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {exportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Export to QuickBooks
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function InvoiceWorkbench({ onRowClick }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [financialRoleFilter, setFinancialRoleFilter] = useState('all');
  const [showReadyOnly, setShowReadyOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchMode, setBatchMode] = useState('MANUAL');
  const [selectedBatch, setSelectedBatch] = useState(null);

  // Fetch invoice-ready items
  const { data: invoiceData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['invoiceReadyItems'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getInvoiceReadyItems', {});
      return response.data;
    },
    staleTime: 30000,
  });

  // Fetch projects for filter
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  // Create batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async (items) => {
      const response = await base44.functions.invoke('createInvoiceBatch', {
        items,
        batch_mode: batchMode,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Created ${data.batches_created} batch(es) with ${data.lines_created} lines`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['invoiceReadyItems'] });
      queryClient.invalidateQueries({ queryKey: ['invoiceBatches'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create batch');
    },
  });

  // Filter items
  const filteredItems = useMemo(() => {
    if (!invoiceData) return [];
    
    let items = showReadyOnly ? (invoiceData.invoice_ready || []) : [
      ...(invoiceData.invoice_ready || []),
      ...(invoiceData.not_ready || []),
    ];
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      items = items.filter(i => 
        i.part_name?.toLowerCase().includes(search) ||
        i.project_name?.toLowerCase().includes(search)
      );
    }
    
    if (projectFilter !== 'all') {
      items = items.filter(i => i.project_id === projectFilter);
    }
    
    if (financialRoleFilter !== 'all') {
      items = items.filter(i => i.financial_role === financialRoleFilter);
    }
    
    return items;
  }, [invoiceData, searchTerm, projectFilter, financialRoleFilter, showReadyOnly]);

  const selectedItems = filteredItems.filter(item => selectedIds.has(item.id));

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const readyItems = filteredItems.filter(i => i.is_ready);
    if (selectedIds.size === readyItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(readyItems.map(i => i.id)));
    }
  };

  const handleCreateBatch = () => {
    if (selectedItems.length === 0) return;
    createBatchMutation.mutate(selectedItems);
  };

  const totals = invoiceData?.totals || {};

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-green-900/20 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-xs text-gray-400 uppercase">Ready to Invoice</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{totals.ready_count || 0}</p>
            <p className="text-sm text-gray-400">${(totals.ready_amount || 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-900/20 border-yellow-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <span className="text-xs text-gray-400 uppercase">Missing Pricing</span>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{totals.missing_pricing_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-gray-400" />
              <span className="text-xs text-gray-400 uppercase">Not Ready</span>
            </div>
            <p className="text-2xl font-bold text-gray-400">{totals.not_ready_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-900/20 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-blue-400" />
              <span className="text-xs text-gray-400 uppercase">Selected</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">{selectedIds.size}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Invoice Queue Table */}
        <div className="lg:col-span-3">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="border-b border-gray-800 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-400" />
                  Invoice Queue
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetch()} 
                    disabled={isFetching}
                    className="border-gray-700"
                  >
                    {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-900/50 border-gray-700 h-9"
                  />
                </div>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 h-9">
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
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 h-9">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="VENDOR_MARGIN">Vendor Margin</SelectItem>
                    <SelectItem value="INTERNAL_MANUFACTURING">Internal Mfg</SelectItem>
                    <SelectItem value="LABOR_ONLY">Labor Only</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="readyOnly"
                    checked={showReadyOnly}
                    onCheckedChange={setShowReadyOnly}
                  />
                  <Label htmlFor="readyOnly" className="text-sm text-gray-400">Ready only</Label>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-500" />
                  <p className="text-gray-400">Loading invoice queue...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="text-green-400">No items in queue</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-700 hover:bg-transparent">
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={selectedIds.size === filteredItems.filter(i => i.is_ready).length && filteredItems.filter(i => i.is_ready).length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-gray-400 text-xs">Project</TableHead>
                      <TableHead className="text-gray-400 text-xs">Part</TableHead>
                      <TableHead className="text-gray-400 text-xs text-right">Qty</TableHead>
                      <TableHead className="text-gray-400 text-xs text-right">Unit Price</TableHead>
                      <TableHead className="text-gray-400 text-xs text-right">Total</TableHead>
                      <TableHead className="text-gray-400 text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map(item => (
                      <TableRow 
                        key={item.id}
                        className={cn(
                          "border-b border-gray-800 hover:bg-gray-800/50",
                          !item.is_ready && "opacity-50"
                        )}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelection(item.id)}
                            disabled={!item.is_ready}
                          />
                        </TableCell>
                        <TableCell>
                          <Link 
                            to={`${createPageUrl('ProjectDetail')}?id=${item.project_id}`}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.project_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <button 
                            onClick={() => onRowClick?.(item)}
                            className="text-left hover:text-white"
                          >
                            <p className="text-white text-sm">{item.part_name}</p>
                            {item.part_number && (
                              <p className="text-xs text-gray-500">{item.part_number}</p>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-right text-gray-300">{item.qty}</TableCell>
                        <TableCell className="text-right text-gray-300">
                          {item.unit_price > 0 ? `$${item.unit_price.toFixed(2)}` : (
                            <Badge className="bg-red-600/30 text-red-400 text-xs">Missing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-green-400 font-medium">
                          ${(item.line_total || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {item.is_ready ? (
                            <Badge className="bg-green-600 text-xs">Ready</Badge>
                          ) : (
                            <Badge className="bg-gray-600 text-xs" title={item.not_ready_reason}>
                              {item.not_ready_reason?.slice(0, 15) || 'Not Ready'}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Batch History Sidebar */}
        <div className="lg:col-span-1">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader className="border-b border-gray-800 p-4">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Recent Batches
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <BatchHistoryPanel onBatchClick={setSelectedBatch} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Batch Builder Panel */}
      <BatchBuilderPanel
        selectedItems={selectedItems}
        batchMode={batchMode}
        setBatchMode={setBatchMode}
        onCreateBatch={handleCreateBatch}
        onClearSelection={() => setSelectedIds(new Set())}
        isCreating={createBatchMutation.isPending}
      />

      {/* Batch Detail Modal */}
      <BatchDetailModal
        batch={selectedBatch}
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
      />
    </div>
  );
}