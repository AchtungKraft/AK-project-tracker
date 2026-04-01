import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Shield } from "lucide-react";
import { toast } from "sonner";

/**
 * PricingStrictModeConfig - Admin config for pricing guardrails
 * 
 * Stored on User entity (admin settings) as pricing_strict_mode
 * 
 * When enabled:
 * - PO line creation blocks on unit_cost = 0
 * - Bulk PO preview shows hard error instead of warning
 * 
 * Future-ready: reads/writes to admin's user record
 */
export default function PricingStrictModeConfig() {
  const [strictMode, setStrictMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(user => {
      setStrictMode(user?.pricing_strict_mode === true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleToggle = async (checked) => {
    setStrictMode(checked);
    try {
      await base44.auth.updateMe({ pricing_strict_mode: checked });
      toast.success(checked ? 'Strict mode enabled — $0 PO lines will be blocked' : 'Strict mode disabled');
    } catch (err) {
      setStrictMode(!checked);
      toast.error('Failed to update: ' + err.message);
    }
  };

  if (loading) return null;

  return (
    <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-white">Pricing Guardrails</h3>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label className="text-gray-300 text-sm">Require cost on PO creation</Label>
          <p className="text-xs text-gray-500">
            When enabled, PO lines with $0 unit cost will be blocked. Prevents zero-cost entries from entering the system.
          </p>
        </div>
        <Switch checked={strictMode} onCheckedChange={handleToggle} />
      </div>

      {strictMode && (
        <div className="flex items-start gap-2 p-2 bg-amber-900/20 border border-amber-700/30 rounded text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Strict mode is active. PO creation will fail if any line has $0 cost.</span>
        </div>
      )}
    </div>
  );
}