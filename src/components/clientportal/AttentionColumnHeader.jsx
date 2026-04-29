import React from "react";
import { Badge } from "@/components/ui/badge";

export default function AttentionColumnHeader({ label, subtitle, count, headerBg, headerBorder, headerText, countBg, countText }) {
  return (
    <div className={`rounded-lg border ${headerBorder} ${headerBg} px-3 py-2.5`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className={`font-semibold text-sm ${headerText}`}>{label}</h3>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <Badge className={`${countBg} ${countText} border-transparent text-sm px-2 py-0.5`}>
          {count}
        </Badge>
      </div>
    </div>
  );
}