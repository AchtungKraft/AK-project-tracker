import React from 'react';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatsCard({ title, value, icon: Icon, gradient }) {
  return (
    <Card className="relative overflow-hidden bg-black/40 backdrop-blur-xl border border-red-900/30">
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 transform translate-x-8 -translate-y-8 rounded-full opacity-20 bg-gradient-to-br",
        gradient
      )} />
      <CardHeader className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-gray-400 mb-2">{title}</p>
            <CardTitle className="text-3xl font-bold text-white">
              {value}
            </CardTitle>
          </div>
          <div className={cn(
            "p-3 rounded-xl bg-gradient-to-br",
            gradient,
            "bg-opacity-20"
          )}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}