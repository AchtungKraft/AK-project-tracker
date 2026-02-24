import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Wallet,
  Loader2,
  AlertCircle,
  FileText,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * ApplyCreditModal - Manual Credit Allocator
 * 
 * Allows applying credit to:
 * - Open invoices (invoice targets)
 * - Uninvoiced part commitments (commitment targets)
 * 
 * Features:
 * - Manual row-by-row allocation
 * - Idempotent via nonce
 * - Race condition protection
 * - No auto-allocation
 */

const INITIAL_ALLOCATOR_STATE = {
  targetsByKey: {},
  orderedKeys: [],
  selectedKeys: new Set(),
  amountsByKey: {},
  creditAvailable: 0,
  isHydrating: true,
  isApplying: false,
  lastHydratedAt: 0,
  submitNonce: null,
  error: null,
};

export default function ApplyCreditModal({
  open,
  onClose,
  projectId,
  projectName,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const hydrationRef = useRef(0);

  const [allocator, setAllocator] = useState(INITIAL_ALLOCATOR_STATE);

  const normalizedProjectId = projectId ? String(projectId) : "";

  // === HYDRATION ===
  useEffect(() => {
    if (!open || !normalizedProjectId) {
      return;
    }

    const hydrationId = ++hydrationRef.current;

    const hydrate = async () => {
      setAllocator(prev => ({ ...prev, isHydrating: true, error: null }));

      try {
        const response = await base44.functions.invoke("getProjectCreditAllocationPreview", {
          project_id: normalizedProjectId,
        });

        // Guard against stale hydration
        if (hydrationRef.current !== hydrationId) {
          return;
        }

        const data = response.data;

        if (!data.success) {
          setAllocator(prev => ({
            ...prev,
            isHydrating: false,
            error: data.error || "Failed to load allocation targets",
          }));
          return;
        }

        const newTargetsByKey = {};
        const newOrderedKeys = [];

        for (const target of data.targets || []) {
          newTargetsByKey[target.key] = target;
          newOrderedKeys.push(target.key);
        }

        setAllocator(prev => {
          // Preserve user-entered amounts for keys that still exist
          const preservedAmounts = {};
          for (const key of Object.keys(prev.amountsByKey)) {
            if (newTargetsByKey[key]) {
              preservedAmounts[key] = prev.amountsByKey[key];
            }
          }

          // Preserve selections for keys that still exist
          const preservedSelections = new Set();
          for (const key of prev.selectedKeys) {
            if (newTargetsByKey[key]) {
              preservedSelections.add(key);
            }
          }

          return {
            ...prev,
            targetsByKey: newTargetsByKey,
            orderedKeys: newOrderedKeys,
            creditAvailable: data.credit_available ?? 0,
            isHydrating: false,
            lastHydratedAt: Date.now(),
            amountsByKey: preservedAmounts,
            selectedKeys: preservedSelections,
            error: null,
          };
        });
      } catch (err) {
        if (hydrationRef.current !== hydrationId) return;
        setAllocator(prev => ({
          ...prev,
          isHydrating: false,
          error: err.message,
        }));
      }
    };

    hydrate();
  }, [open, normalizedProjectId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setAllocator(INITIAL_ALLOCATOR_STATE);
      hydrationRef.current++;
    }
  }, [open]);

  // === DERIVED VALUES ===
  const { parsedAmounts, selectedTotal, remainingCredit, validationByKey, canApply } = useMemo(() => {
    const parsed = {};
    const validation = {};
    let total = 0;

    for (const key of allocator.selectedKeys) {
      const raw = allocator.amountsByKey[key] ?? "";
      const num = parseFloat(raw) || 0;
      parsed[key] = num;

      const target = allocator.targetsByKey[key];
      const outstanding = target?.outstanding ?? 0;

      if (num <= 0) {
        validation[key] = { valid: false, message: "Amount must be positive" };
      } else if (num > outstanding) {
        validation[key] = { valid: false, message: `Exceeds outstanding (${formatCurrencyUSD(outstanding)})` };
      } else {
        validation[key] = { valid: true };
        total += num;
      }
    }

    const remaining = allocator.creditAvailable - total;
    const overBudget = total > allocator.creditAvailable;
    
    const hasValidSelections = allocator.selectedKeys.size > 0 &&
      [...allocator.selectedKeys].every(key => validation[key]?.valid);

    const canSubmit = hasValidSelections && !overBudget && !allocator.isApplying && !allocator.isHydrating;

    return {
      parsedAmounts: parsed,
      selectedTotal: total,
      remainingCredit: remaining,
      validationByKey: validation,
      canApply: canSubmit,
    };
  }, [allocator.selectedKeys, allocator.amountsByKey, allocator.targetsByKey, allocator.creditAvailable, allocator.isApplying, allocator.isHydrating]);

  // === HANDLERS ===
  const handleToggleSelection = (key) => {
    setAllocator(prev => {
      const newSelected = new Set(prev.selectedKeys);
      if (newSelected.has(key)) {
        newSelected.delete(key);
      } else {
        newSelected.add(key);
      }
      return { ...prev, selectedKeys: newSelected };
    });
  };

  const handleAmountChange = (key, value) => {
    setAllocator(prev => ({
      ...prev,
      amountsByKey: { ...prev.amountsByKey, [key]: value },
    }));
  };

  const handleMaxAmount = (key) => {
    const target = allocator.targetsByKey[key];
    if (!target) return;

    const maxForRow = Math.min(target.outstanding, remainingCredit + (parsedAmounts[key] || 0));
    
    setAllocator(prev => {
      const newSelected = new Set(prev.selectedKeys);
      newSelected.add(key);
      return {
        ...prev,
        selectedKeys: newSelected,
        amountsByKey: { ...prev.amountsByKey, [key]: maxForRow.toFixed(2) },
      };
    });
  };

  const handleFillRemaining = () => {
    // Fill remaining credit across selected rows that have room
    let remaining = remainingCredit;
    const newAmounts = { ...allocator.amountsByKey };

    for (const key of allocator.selectedKeys) {
      if (remaining <= 0) break;
      
      const target = allocator.targetsByKey[key];
      if (!target) continue;

      const current = parsedAmounts[key] || 0;
      const room = target.outstanding - current;
      
      if (room > 0) {
        const toAdd = Math.min(room, remaining);
        newAmounts[key] = (current + toAdd).toFixed(2);
        remaining -= toAdd;
      }
    }

    setAllocator(prev => ({ ...prev, amountsByKey: newAmounts }));
  };

  const handleClose = () => {
    onClose();
  };

  // === SUBMIT ===
  const applyCredit = async () => {
    if (!canApply) return;

    const nonce = crypto.randomUUID();

    // Build allocations payload
    const allocations = [];
    for (const key of allocator.selectedKeys) {
      const amount = parsedAmounts[key];
      if (!amount || amount <= 0) continue;

      const target = allocator.targetsByKey[key];
      if (!target) continue;

      allocations.push({
        target_type: target.target_type,
        target_id: target.target_id,
        amount,
      });
    }

    if (allocations.length === 0) {
      toast.error("No valid allocations to apply");
      return;
    }

    setAllocator(prev => ({
      ...prev,
      isApplying: true,
      submitNonce: nonce,
      error: null,
    }));

    try {
      const response = await base44.functions.invoke("applyProjectCreditManual", {
        project_id: normalizedProjectId,
        nonce,
        allocations,
      });

      const data = response.data;

      if (!data.success) {
        throw new Error(data.error || "Failed to apply credit");
      }

      toast.success(`Applied ${formatCurrencyUSD(data.total_applied)} credit`);

      // Force refresh
      await forceAppRefresh(queryClient, { projectIds: [normalizedProjectId] });

      onSuccess?.();
      handleClose();
    } catch (err) {
      setAllocator(prev => ({
        ...prev,
        isApplying: false,
        error: err.message,
      }));
      toast.error(err.message);
    }
  };

  // === RENDER ===
  const invoiceTargets = allocator.orderedKeys
    .filter(key => allocator.targetsByKey[key]?.target_type === 'invoice')
    .map(key => allocator.targetsByKey[key]);

  const commitmentTargets = allocator.orderedKeys
    .filter(key => allocator.targetsByKey[key]?.target_type === 'commitment')
    .map(key => allocator.targetsByKey[key]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wallet className="w-5 h-5 text-green-400" />
            Apply Credit Manually
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Select rows and enter amounts to allocate credit for {projectName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Header */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div>
              <p className="text-xs text-gray-500 uppercase">Credit Available</p>
              <p className="text-xl font-bold text-green-400 font-mono">
                {formatCurrencyUSD(allocator.creditAvailable)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Total Selected</p>
              <p className={cn(
                "text-xl font-bold font-mono",
                selectedTotal > allocator.creditAvailable ? "text-red-400" : "text-blue-400"
              )}>
                {formatCurrencyUSD(selectedTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Remaining Credit</p>
              <p className={cn(
                "text-xl font-bold font-mono",
                remainingCredit < 0 ? "text-red-400" : "text-amber-400"
              )}>
                {formatCurrencyUSD(remainingCredit)}
              </p>
            </div>
          </div>

          {/* Error Display */}
          {allocator.error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-300 text-sm">{allocator.error}</span>
            </div>
          )}

          {/* Loading State */}
          {allocator.isHydrating ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-400">Loading allocation targets...</span>
            </div>
          ) : allocator.orderedKeys.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No outstanding invoices or commitments to apply credit to.
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {/* Invoice Section */}
                {invoiceTargets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <FileText className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-gray-300">
                        Invoices ({invoiceTargets.length})
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-700">
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-gray-400">Invoice</TableHead>
                          <TableHead className="text-right text-gray-400">Outstanding</TableHead>
                          <TableHead className="text-gray-400 w-32">Credit to Apply</TableHead>
                          <TableHead className="text-right text-gray-400">Net After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceTargets.map(target => (
                          <AllocationRow
                            key={target.key}
                            target={target}
                            isSelected={allocator.selectedKeys.has(target.key)}
                            amount={allocator.amountsByKey[target.key] ?? ""}
                            parsedAmount={parsedAmounts[target.key] ?? 0}
                            validation={validationByKey[target.key]}
                            onToggle={() => handleToggleSelection(target.key)}
                            onAmountChange={(v) => handleAmountChange(target.key, v)}
                            onMax={() => handleMaxAmount(target.key)}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Commitment Section */}
                {commitmentTargets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Package className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-gray-300">
                        Uninvoiced Parts ({commitmentTargets.length})
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-700">
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-gray-400">Part</TableHead>
                          <TableHead className="text-right text-gray-400">Outstanding</TableHead>
                          <TableHead className="text-gray-400 w-32">Credit to Apply</TableHead>
                          <TableHead className="text-right text-gray-400">Net After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commitmentTargets.map(target => (
                          <AllocationRow
                            key={target.key}
                            target={target}
                            isSelected={allocator.selectedKeys.has(target.key)}
                            amount={allocator.amountsByKey[target.key] ?? ""}
                            parsedAmount={parsedAmounts[target.key] ?? 0}
                            validation={validationByKey[target.key]}
                            onToggle={() => handleToggleSelection(target.key)}
                            onAmountChange={(v) => handleAmountChange(target.key, v)}
                            onMax={() => handleMaxAmount(target.key)}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="flex gap-2">
            {allocator.selectedKeys.size > 0 && remainingCredit > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleFillRemaining}
                disabled={allocator.isApplying}
              >
                Fill Remaining
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={allocator.isApplying}>
              Cancel
            </Button>
            <Button
              onClick={applyCredit}
              disabled={!canApply}
              className={cn(
                "gap-2",
                canApply && "bg-green-600 hover:bg-green-700"
              )}
            >
              {allocator.isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Apply {formatCurrencyUSD(selectedTotal)}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === ALLOCATION ROW COMPONENT ===
function AllocationRow({
  target,
  isSelected,
  amount,
  parsedAmount,
  validation,
  onToggle,
  onAmountChange,
  onMax,
}) {
  const netAfter = target.outstanding - (isSelected ? parsedAmount : 0);
  const hasError = isSelected && validation && !validation.valid;

  return (
    <TableRow className="border-gray-800">
      <TableCell className="pr-0">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
        />
      </TableCell>
      <TableCell>
        <div>
          <p className="text-white text-sm font-medium">{target.label_primary}</p>
          {target.label_secondary && (
            <p className="text-xs text-gray-500">{target.label_secondary}</p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <span className="text-gray-300 font-mono">
          {formatCurrencyUSD(target.outstanding)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.00"
            className={cn(
              "w-24 h-8 text-right font-mono text-sm",
              hasError && "border-red-500"
            )}
            disabled={!isSelected}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onMax}
            className="h-8 px-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Max
          </Button>
        </div>
        {hasError && (
          <p className="text-xs text-red-400 mt-1">{validation.message}</p>
        )}
      </TableCell>
      <TableCell className="text-right">
        <span className={cn(
          "font-mono",
          netAfter <= 0 ? "text-green-400" : "text-amber-400"
        )}>
          {formatCurrencyUSD(Math.max(0, netAfter))}
        </span>
      </TableCell>
    </TableRow>
  );
}