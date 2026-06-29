import React from "react";
import { Clock, Zap } from "lucide-react";

export default function VendorLeadTimeDisplay({ vendor }) {
  const hasData = vendor.typical_lead_time_days || vendor.rush_capable || vendor.lead_time_notes;
  if (!hasData) return null;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 space-y-2">
      {vendor.typical_lead_time_days != null && (
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs text-gray-400">Typical:</span>
          <span className="text-sm font-medium text-white ml-auto">
            {vendor.typical_lead_time_days} day{vendor.typical_lead_time_days !== 1 ? "s" : ""}
          </span>
        </div>
      )}
      {vendor.rush_capable != null && (
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-gray-400">Rush Available:</span>
          <span className={`text-sm font-medium ml-auto ${vendor.rush_capable ? "text-green-400" : "text-gray-500"}`}>
            {vendor.rush_capable ? "Yes" : "No"}
          </span>
        </div>
      )}
      {vendor.lead_time_notes && (
        <p className="text-xs text-gray-500 italic border-t border-gray-700/50 pt-1.5 mt-1">
          {vendor.lead_time_notes}
        </p>
      )}
    </div>
  );
}