import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GROUP_REPORT_CONFIGS, loadSavedPrintOptions, savePrintOptions } from "@/components/parts/print/sharedPrintConfig";

const STORAGE_KEY = "ak_group_print_options";

/**
 * Print options modal for Parts Groups.
 * Consumes shared report config from sharedPrintConfig.js.
 * Adds group-specific controls: Group Report By.
 */
export default function PartGroupPrintModal({ onClose, onPrint }) {
  const [reportType, setReportType] = useState("summary");
  const config = GROUP_REPORT_CONFIGS[reportType];
  const [opts, setOpts] = useState(() => {
    const saved = loadSavedPrintOptions(STORAGE_KEY);
    return { ...config.defaults, ...(saved[reportType] || {}) };
  });

  const handleTypeChange = (type) => {
    setReportType(type);
    const saved = loadSavedPrintOptions(STORAGE_KEY);
    setOpts({ ...GROUP_REPORT_CONFIGS[type].defaults, ...(saved[type] || {}) });
  };

  const handleToggle = (key) => setOpts(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePrint = () => {
    const allSaved = loadSavedPrintOptions(STORAGE_KEY);
    allSaved[reportType] = opts;
    savePrintOptions(STORAGE_KEY, allSaved);
    onPrint(reportType, opts);
  };

  const Icon = config.icon;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Print Parts Group</DialogTitle>
        </DialogHeader>

        {/* Report type selector */}
        <div className="flex gap-2 pb-2 flex-wrap">
          {Object.entries(GROUP_REPORT_CONFIGS).map(([key, cfg]) => {
            const I = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => handleTypeChange(key)}
                className={`flex-1 min-w-[70px] flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                  reportType === key
                    ? "border-red-600 bg-red-950/30 text-red-400"
                    : "border-gray-700 text-gray-400 hover:border-gray-600"
                }`}
              >
                <I className="w-4 h-4" />
                <span className="text-center leading-tight">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mb-2">
          {config.description}
          {config.isGroupOnly && <span className="text-yellow-500/80 ml-1">(Group-specific)</span>}
        </p>

        {/* Group report by — group-specific control */}
        <div className="space-y-2 pb-2 border-b border-gray-800">
          <Label className="text-xs text-gray-400">Group Report By</Label>
          <Select
            value={opts.groupReportBy || "section"}
            onValueChange={v => setOpts(prev => ({ ...prev, groupReportBy: v }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="section">Group Section</SelectItem>
              <SelectItem value="category">Part Category</SelectItem>
              <SelectItem value="none">No Grouping</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Toggle options — driven by shared config */}
        <div className="space-y-3 py-2">
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
            <Icon className="w-4 h-4 mr-1.5" /> Print Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}