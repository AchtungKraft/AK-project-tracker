import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CATALOG_REPORT_CONFIGS, loadSavedPrintOptions, savePrintOptions } from "./sharedPrintConfig";

const STORAGE_KEY = "ak_print_options";

/**
 * Print options modal for Parts Catalog.
 * Consumes shared report config from sharedPrintConfig.js.
 * reportType is passed in — the caller owns report type selection.
 */
export default function PrintOptionsModal({ reportType, onClose, onPrint }) {
  const config = CATALOG_REPORT_CONFIGS[reportType];
  const [opts, setOpts] = useState(() => {
    const saved = loadSavedPrintOptions(STORAGE_KEY);
    return { ...config.defaults, ...(saved[reportType] || {}) };
  });

  const handleToggle = (key) => {
    setOpts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrint = () => {
    const allSaved = loadSavedPrintOptions(STORAGE_KEY);
    allSaved[reportType] = opts;
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