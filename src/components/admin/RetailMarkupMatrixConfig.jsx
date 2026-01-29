import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  AlertTriangle, 
  Calculator,
  DollarSign,
  Percent,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

export default function RetailMarkupMatrixConfig() {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingTier, setEditingTier] = useState(null);
  const [formData, setFormData] = useState({
    min_cost: '',
    max_cost: '',
    markup_pct: '',
    label: '',
    active: true
  });
  const [testCost, setTestCost] = useState('');

  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ['retailMarkupMatrix'],
    queryFn: () => base44.entities.RetailMarkupMatrix.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RetailMarkupMatrix.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retailMarkupMatrix'] });
      toast.success('Tier created');
      resetForm();
    },
    onError: (error) => toast.error('Failed to create tier: ' + error.message)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RetailMarkupMatrix.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retailMarkupMatrix'] });
      toast.success('Tier updated');
      resetForm();
    },
    onError: (error) => toast.error('Failed to update tier: ' + error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RetailMarkupMatrix.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retailMarkupMatrix'] });
      toast.success('Tier deleted');
    },
    onError: (error) => toast.error('Failed to delete tier: ' + error.message)
  });

  const activeTiers = useMemo(() => 
    tiers.filter(t => t.active).sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0)),
    [tiers]
  );

  const allTiersSorted = useMemo(() => 
    [...tiers].sort((a, b) => (a.min_cost || 0) - (b.min_cost || 0)),
    [tiers]
  );

  // Validate matrix for gaps and overlaps
  const matrixValidation = useMemo(() => {
    const errors = [];
    const active = activeTiers;
    
    if (active.length === 0) {
      errors.push('No active tiers defined');
      return { valid: false, errors };
    }

    // Check if first tier starts at 0
    if (active[0].min_cost !== 0) {
      errors.push(`Gap: No tier covers $0 - $${active[0].min_cost}`);
    }

    // Check for gaps and overlaps between tiers
    for (let i = 0; i < active.length - 1; i++) {
      const current = active[i];
      const next = active[i + 1];
      
      if (current.max_cost === null || current.max_cost === undefined) {
        errors.push(`Tier "${current.label || i}" has no upper bound but is not the last tier`);
      } else if (current.max_cost < next.min_cost) {
        errors.push(`Gap: No tier covers $${current.max_cost} - $${next.min_cost}`);
      } else if (current.max_cost > next.min_cost) {
        errors.push(`Overlap: Tiers overlap between $${next.min_cost} - $${current.max_cost}`);
      }
    }

    // Check that the last tier has no upper bound
    const lastTier = active[active.length - 1];
    if (lastTier && lastTier.max_cost !== null && lastTier.max_cost !== undefined) {
      errors.push(`Last tier "${lastTier.label || 'unnamed'}" should have no upper bound (open-ended)`);
    }

    return { valid: errors.length === 0, errors };
  }, [activeTiers]);

  // Calculate test result
  const testResult = useMemo(() => {
    const cost = parseFloat(testCost);
    if (isNaN(cost) || cost < 0) return null;
    
    const tier = activeTiers.find(t => 
      cost >= (t.min_cost || 0) && 
      (t.max_cost === null || t.max_cost === undefined || cost < t.max_cost)
    );
    
    if (!tier) return { error: 'No matching tier found' };
    
    const unitRetail = Math.round(cost * (1 + (tier.markup_pct || 0)) * 100) / 100;
    return {
      tier,
      markup: tier.markup_pct,
      unitRetail,
      profit: unitRetail - cost
    };
  }, [testCost, activeTiers]);

  const resetForm = () => {
    setFormData({ min_cost: '', max_cost: '', markup_pct: '', label: '', active: true });
    setEditingTier(null);
    setShowAddDialog(false);
  };

  const handleEdit = (tier) => {
    setEditingTier(tier);
    setFormData({
      min_cost: tier.min_cost?.toString() || '',
      max_cost: tier.max_cost?.toString() || '',
      markup_pct: tier.markup_pct ? (tier.markup_pct * 100).toString() : '',
      label: tier.label || '',
      active: tier.active !== false
    });
    setShowAddDialog(true);
  };

  const handleSubmit = () => {
    const data = {
      min_cost: parseFloat(formData.min_cost) || 0,
      max_cost: formData.max_cost ? parseFloat(formData.max_cost) : null,
      markup_pct: parseFloat(formData.markup_pct) / 100 || 0,
      label: formData.label || `$${formData.min_cost}${formData.max_cost ? `-$${formData.max_cost}` : '+'}`,
      active: formData.active,
      sort_order: parseFloat(formData.min_cost) || 0
    };

    if (editingTier) {
      updateMutation.mutate({ id: editingTier.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (tier) => {
    if (confirm(`Delete tier "${tier.label}"?`)) {
      deleteMutation.mutate(tier.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Retail Markup Matrix</h2>
          <p className="text-sm text-gray-400">Configure cost-based markup tiers for build parts pricing</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="bg-red-600 hover:bg-red-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Tier
        </Button>
      </div>

      {/* Validation Status */}
      {!matrixValidation.valid && (
        <Card className="bg-amber-900/20 border-amber-500/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-400">Matrix Configuration Issues</h3>
                <ul className="text-sm text-amber-300 mt-1 space-y-1">
                  {matrixValidation.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {matrixValidation.valid && (
        <Card className="bg-green-900/20 border-green-500/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-green-400">Matrix is valid - all cost ranges are covered with no gaps or overlaps</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tiers Table */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Markup Tiers</CardTitle>
          <CardDescription>Parts are priced based on their cost falling within these tiers</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700">
                <TableHead className="text-gray-400">Label</TableHead>
                <TableHead className="text-gray-400">Cost Range</TableHead>
                <TableHead className="text-gray-400 text-center">Markup %</TableHead>
                <TableHead className="text-gray-400 text-center">Status</TableHead>
                <TableHead className="text-gray-400 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTiersSorted.map((tier) => (
                <TableRow key={tier.id} className={`border-gray-700 ${!tier.active ? 'opacity-50' : ''}`}>
                  <TableCell className="text-white font-medium">{tier.label || 'Unnamed'}</TableCell>
                  <TableCell className="text-gray-300">
                    <span className="font-mono">
                      ${tier.min_cost?.toFixed(2) || '0.00'} — {
                        tier.max_cost !== null && tier.max_cost !== undefined 
                          ? `$${tier.max_cost.toFixed(2)}` 
                          : '∞'
                      }
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                      {((tier.markup_pct || 0) * 100).toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {tier.active !== false ? (
                      <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                    ) : (
                      <Badge className="bg-gray-500/20 text-gray-400">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(tier)}
                        className="text-gray-400 hover:text-white"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(tier)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allTiersSorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                    No markup tiers configured. Add your first tier to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Test Calculator */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Pricing Calculator
          </CardTitle>
          <CardDescription>Test how a part cost would be priced using the current matrix</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <Label className="text-gray-300">Enter Part Cost</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="number"
                  value={testCost}
                  onChange={(e) => setTestCost(e.target.value)}
                  placeholder="0.00"
                  className="pl-8 bg-gray-800 border-gray-700"
                />
              </div>
            </div>
            
            {testResult && !testResult.error && (
              <div className="flex items-center gap-6 pb-1">
                <div className="text-center">
                  <div className="text-xs text-gray-500 uppercase">Tier</div>
                  <div className="text-white font-medium">{testResult.tier.label}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 uppercase">Markup</div>
                  <div className="text-blue-400 font-medium">{(testResult.markup * 100).toFixed(0)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 uppercase">Unit Retail</div>
                  <div className="text-green-400 font-bold text-lg">${testResult.unitRetail.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 uppercase">Profit</div>
                  <div className="text-amber-400 font-medium">${testResult.profit.toFixed(2)}</div>
                </div>
              </div>
            )}
            
            {testResult?.error && (
              <div className="text-red-400 pb-1">{testResult.error}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) resetForm(); else setShowAddDialog(true); }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{editingTier ? 'Edit Tier' : 'Add New Tier'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Min Cost ($)</Label>
                <Input
                  type="number"
                  value={formData.min_cost}
                  onChange={(e) => setFormData({ ...formData, min_cost: e.target.value })}
                  placeholder="0"
                  className="bg-gray-800 border-gray-700 mt-1"
                />
              </div>
              <div>
                <Label className="text-gray-300">Max Cost ($) <span className="text-gray-500">- leave empty for ∞</span></Label>
                <Input
                  type="number"
                  value={formData.max_cost}
                  onChange={(e) => setFormData({ ...formData, max_cost: e.target.value })}
                  placeholder="No limit"
                  className="bg-gray-800 border-gray-700 mt-1"
                />
              </div>
            </div>
            
            <div>
              <Label className="text-gray-300">Markup Percentage (%)</Label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  value={formData.markup_pct}
                  onChange={(e) => setFormData({ ...formData, markup_pct: e.target.value })}
                  placeholder="50"
                  className="bg-gray-800 border-gray-700 pr-8"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              </div>
            </div>
            
            <div>
              <Label className="text-gray-300">Label</Label>
              <Input
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g. Under $25"
                className="bg-gray-800 border-gray-700 mt-1"
              />
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <Label className="text-gray-300">Active</Label>
              <Switch
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={resetForm} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              className="bg-red-600 hover:bg-red-700"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingTier ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}