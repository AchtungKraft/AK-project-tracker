import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATALOG_REPORT_CONFIGS,
  PRICING_MODES,
  PRICING_MODE_LABELS,
  loadReportOptions,
  savePrintOptions,
  loadSavedPrintOptions,
} from "./sharedPrintConfig";

const STORAGE_KEY = "ak_print_options";

/**
 * Print options modal for Parts Catalog.
 * Uses canonical pricingMode — same control as Parts Group.
 */
export default function PrintOptionsModal({ reportType, onClose, onPrint }) {
  const config = CATALOG_REPORT_CONFIGS[reportType];
  const [opts, setOpts] = useState(() =>
    loadReportOptions(STORAGE_KEY, reportType, CATALOG_REPORT_CONFIGS)
  );

  const handleToggle = (key) => {
    setOpts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrint = () => {
    const allSaved = loadSavedPrintOptions(STORAGE_KEY);
    const toSave = { ...opts };
    delete toSave.includeCost;
    delete toSave.includeRetail;
    allSaved[reportType] = toSave;
    savePrintOptions(STORAGE_KEY, allSaved);
    onPrint(opts);
    onClose();
  };

  const Icon = config.icon;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="w-5 h-5 text-red-400" />
            {config.label}
          </DialogTitle>
          <p className="text-xs text-gray-400 mt-1">{config.description}</p>
        </DialogHeader>

        {/* Pricing Display — single canonical control */}
        <div className="space-y-2 pb-3 border-b border-gray-800">
          <Label className="text-xs text-gray-400">Pricing Display</Label>
          <Select
            value={opts.pricingMode || PRICING_MODES.BOTH}
            onValueChange={v => setOpts(prev => ({ ...prev, pricingMode: v }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRICING_MODE_LABELS).map(([mode, label]) => (
                <SelectItem key={mode} value={mode}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {opts.pricingMode === PRICING_MODES.RETAIL_ONLY && (
            <p className="text-[10px] text-emerald-500/80">✓ Client-safe — no internal cost data will appear in the report.</p>
          )}
        </div>

        {config.toggles.length > 0 && (
          <div className="space-y-3 py-3">
            {config.toggles.map(toggle => (
              <div key={toggle.key} className="flex items-center gap-3">
                <Checkbox
                  id={toggle.key}
                  checked={opts[toggle.key] ?? config.defaults[toggle.key]}
                  onCheckedChange={() => handleToggle(toggle.key)}
                />
                <Label htmlFor={toggle.key} className="text-sm text-gray-200 cursor-pointer">
                  {toggle.label}
                </Label>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handlePrint} className="bg-red-600 hover:bg-red-700">
            Print Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}