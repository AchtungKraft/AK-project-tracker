import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Shield, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function LandedCostAuditPanel() {
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runAudit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const payload = orderId ? { order_id: orderId } : { limit: 25 };
      const res = await base44.functions.invoke("auditLandedCostSync", payload);
      setResult(res.data);
      if (res.data.ok) {
        toast.success("Audit passed — no mismatches");
      } else {
        toast.warning(`Audit found ${res.data.errors.length} error(s)`);
      }
    } catch (err) {
      toast.error("Audit failed: " + err.message);
      setResult({ ok: false, errors: [{ type: "AUDIT_FAILED", message: err.message }], warnings: [], summary: {} });
    } finally {
      setLoading(false);
    }
  };

  const runReallocation = async () => {
    if (!orderId) { toast.error("Enter a PO ID to re-allocate"); return; }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("allocatePOCosts", { order_id: orderId });
      const d = res.data;
      toast.success(`Allocation complete: ${d.commitment_sync?.synced || 0} synced, ${d.commitment_sync?.failed || 0} failed`);
      // Re-run audit
      await runAudit();
    } catch (err) {
      toast.error("Re-allocation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-gray-900/80 border-amber-900/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
          <Shield className="w-4 h-4" />
          Landed Cost Audit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs text-gray-400">Order ID (blank = all recent)</Label>
            <Input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Leave blank for all..."
              className="bg-gray-800 border-gray-700 h-8 text-sm"
            />
          </div>
          <Button
            size="sm"
            onClick={runAudit}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 h-8"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Shield className="w-3 h-3 mr-1" />}
            Audit
          </Button>
          {orderId && (
            <Button
              size="sm"
              variant="outline"
              onClick={runReallocation}
              disabled={loading}
              className="border-gray-600 h-8"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Re-Allocate
            </Button>
          )}
        </div>

        {result && (
          <>
            <Separator className="bg-gray-700" />

            {/* Status badge */}
            <div className="flex items-center gap-2">
              {result.ok ? (
                <Badge className="bg-green-900/60 text-green-400 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> All OK
                </Badge>
              ) : (
                <Badge className="bg-red-900/60 text-red-400 gap-1">
                  <XCircle className="w-3 h-3" /> {result.errors?.length} Error(s)
                </Badge>
              )}
              {(result.warnings?.length || 0) > 0 && (
                <Badge className="bg-amber-900/60 text-amber-400 gap-1">
                  <AlertTriangle className="w-3 h-3" /> {result.warnings.length} Warning(s)
                </Badge>
              )}
            </div>

            {/* Summary */}
            {result.summary && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-800/50 rounded p-2">
                  <span className="text-gray-500 block">POs</span>
                  <span className="text-white font-mono">{result.summary.orders_audited ?? 0}</span>
                </div>
                <div className="bg-gray-800/50 rounded p-2">
                  <span className="text-gray-500 block">Lines</span>
                  <span className="text-white font-mono">{result.summary.lines_checked ?? 0}</span>
                </div>
                <div className="bg-gray-800/50 rounded p-2">
                  <span className="text-gray-500 block">Commitments</span>
                  <span className="text-white font-mono">{result.summary.commitments_checked ?? 0}</span>
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors?.length > 0 && (
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {result.errors.map((err, i) => (
                    <div key={i} className="bg-red-950/30 border border-red-900/30 rounded p-2 text-xs">
                      <div className="flex items-center gap-1 text-red-400 font-mono mb-1">
                        <XCircle className="w-3 h-3" />
                        {err.type}
                      </div>
                      <div className="text-gray-400 space-y-0.5">
                        {err.po_number && <div>PO: {err.po_number}</div>}
                        {err.commitment_id && <div>Commitment: {err.commitment_id}</div>}
                        {err.expected != null && <div>Expected: ${err.expected_cost ?? err.expected}</div>}
                        {err.actual != null && <div>Actual: ${err.actual_cost ?? err.actual}</div>}
                        {err.diff != null && (
                          <div className={cn("font-mono", err.diff > 0 ? "text-red-400" : "text-amber-400")}>
                            Diff: ${err.diff}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Warnings */}
            {result.warnings?.length > 0 && (
              <ScrollArea className="max-h-32">
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="bg-amber-950/20 border border-amber-900/20 rounded p-2 text-xs text-amber-400">
                      <span className="font-mono">{w.type}</span>
                      {w.line_id && <span className="text-gray-500 ml-2">Line: {w.line_id.slice(-6)}</span>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}