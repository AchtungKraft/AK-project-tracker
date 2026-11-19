import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Section({ icon: Icon, iconClass, title, children }) {
  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader className="p-3 border-b border-gray-700">
        <CardTitle className="text-sm text-white flex items-center gap-2">
          <Icon className={cn("w-4 h-4", iconClass)} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">{children}</CardContent>
    </Card>
  );
}

export function InfoRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex items-center gap-2 min-w-0">{children}</div>
    </div>
  );
}

export function StatusBadge({ config }) {
  return <Badge className={cn(config.bg, "text-white text-xs")}>{config.label}</Badge>;
}

export function TimelineItem({ icon: Icon, label, date, status, isLast }) {
  const hasDate = !!date;
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", hasDate ? "bg-green-600/20" : "bg-gray-700/50")}>
          <Icon className={cn("w-4 h-4", hasDate ? "text-green-400" : "text-gray-500")} />
        </div>
        {!isLast && <div className="w-0.5 h-8 bg-gray-700 mt-1" />}
      </div>
      <div className="flex-1 pt-1">
        <p className={cn("text-sm", hasDate ? "text-white" : "text-gray-500")}>{label}</p>
        <p className={cn("text-xs", hasDate ? "text-gray-400" : "text-gray-600")}>
          {hasDate ? new Date(date).toLocaleDateString() : "Pending"}
        </p>
      </div>
      {status && <StatusBadge config={status} />}
    </div>
  );
}