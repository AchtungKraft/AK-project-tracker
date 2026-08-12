import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, BookOpen, DollarSign } from "lucide-react";

const STORAGE_KEY = "ak_group_print_options";

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

/**
 * Print options modal for Parts Groups.
 * Mirrors the Parts Tracker PrintOptionsModal architecture with group-specific additions.
 */
const REPORT_CONFIGS = {
  summary: {
    label: "Summary Report",
    description: "Dense table for operations and purchasing. Matches Parts Tracker summary format.",
    icon: FileText,
    defaults: { includeCost: true, includeRetail: false, includeStock: true, includeDemand: true, includeSource: true, includeNotes: true, groupReportBy: "section" },
    options: [
      { key: "includeCost", label: "Include Cost" },
      { key: "includeRetail", label: "Include Retail" },
      { key: "includeStock", label: "Include Stock" },
      { key: "includeDemand", label: "Include Demand" },
      { key: "includeSource", label: "Include Source / Vendor" },
      { key: "includeNotes", label: "Include Notes" },
    ],
  },
  illustrated: {
    label: "Illustrated Catalog",
    description: "Visual cards with thumbnails for technicians. Matches Parts Tracker illustrated format.",
    icon: BookOpen,
    defaults: { includeImages: true, includeSource: true, includeNotes: true, includeCost: true, groupReportBy: "section" },
    options: [
      { key: "includeImages", label: "Include Images" },
      { key: "includeSource", label: "Include Vendor Sources" },
      { key: "includeCost", label: "Include Cost" },
      { key: "includeNotes", label: "Include Notes" },
    ],
  },
  compact: {
    label: "Compact List",
    description: "Scannable checklist with part names and quantities. No financial data.",
    icon: DollarSign,
    defaults: { includePartNumber: true, includeCategory: true, groupReportBy: "section" },
    options: [
      { key: "includePartNumber", label: "Include Part Number" },
      { key: "includeCategory", label: "Include Category" },
    ],
  },
};

export default function PartGroupPrintModal({ onClose, onPrint }) {
  const [reportType, setReportType] = useState("summary");
  const config = REPORT_CONFIGS[reportType];
  const [opts, setOpts] = useState(() => {
    const saved = loadSaved();
    return { ...config.defaults, ...(saved[reportType] || {}) };
  });

  const handleTypeChange = (type) => {
    setReportType(type);
    const saved = loadSaved();
    setOpts({ ...REPORT_CONFIGS[type].defaults, ...(saved[type] || {}) });
  };

  const handleToggle = (key) => setOpts(prev => ({ ...prev, [key]: !prev[key] }));

  const handlePrint = () => {
    const allSaved = loadSaved();
    allSaved[reportType] = opts;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allSaved)); } catch {}
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
        <div className="flex gap-2 pb-2">
          {Object.entries(REPORT_CONFIGS).map(([key, cfg]) => {
            const I = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => handleTypeChange(key)}
                className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                  reportType === key
                    ? "border-red-600 bg-red-950/30 text-red-400"
                    : "border-gray-700 text-gray-400 hover:border-gray-600"
                }`}
              >
                <I className="w-4 h-4" />
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mb-2">{config.description}</p>

        {/* Group report by */}
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

        {/* Toggle options */}
        <div className="space-y-3 py-2">
          {config.options.map(opt => (
            <div key={opt.key} className="flex items-center gap-3">
              <Checkbox
                id={opt.key}
                checked={opts[opt.key] ?? config.defaults[opt.key]}
                onCheckedChange={() => handleToggle(opt.key)}
              />
              <Label htmlFor={opt.key} className="text-sm text-gray-200 cursor-pointer">
                {opt.label}
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