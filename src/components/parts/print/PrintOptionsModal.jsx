import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, BookOpen, DollarSign } from "lucide-react";

const STORAGE_KEY = "ak_print_options";

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOptions(opts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)); } catch {}
}

const REPORT_CONFIGS = {
  summary: {
    label: "Summary Report",
    description: "Dense table for operations, inventory review, and purchasing meetings.",
    icon: FileText,
    defaults: { includeCost: true, includeRetail: true, includeGroupTotals: true },
    options: [
      { key: "includeCost", label: "Include Cost" },
      { key: "includeRetail", label: "Include Retail" },
      { key: "includeGroupTotals", label: "Include Group Totals" },
    ],
  },
  illustrated: {
    label: "Illustrated Catalog",
    description: "Visual cards with thumbnails, locations, and vendor sources for technicians.",
    icon: BookOpen,
    defaults: { includeImages: true, includeVendorSources: true, includeLocations: true, includeNotes: true },
    options: [
      { key: "includeImages", label: "Include Images" },
      { key: "includeVendorSources", label: "Include Vendor Sources" },
      { key: "includeLocations", label: "Include Inventory Locations" },
      { key: "includeNotes", label: "Include Notes" },
    ],
  },
  priceList: {
    label: "Price List",
    description: "Client-facing retail price list. No internal costs, inventory, or vendor data.",
    icon: DollarSign,
    defaults: { includeImages: true, includeDescriptions: true, includeVehicle: false },
    options: [
      { key: "includeImages", label: "Include Images" },
      { key: "includeDescriptions", label: "Include Descriptions" },
      { key: "includeVehicle", label: "Include Vehicle Compatibility" },
    ],
  },
};

export default function PrintOptionsModal({ reportType, onClose, onPrint }) {
  const config = REPORT_CONFIGS[reportType];
  const [opts, setOpts] = useState(() => {
    const saved = loadSaved();
    return { ...config.defaults, ...(saved[reportType] || {}) };
  });

  const handleToggle = (key) => {
    setOpts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrint = () => {
    const allSaved = loadSaved();
    allSaved[reportType] = opts;
    saveOptions(allSaved);
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
            Print Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}