import React from "react";
import { AlertTriangle, ShieldAlert, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

const WARNING_CONFIG = {
  caution: {
    icon: AlertTriangle,
    label: "CAUTION",
    bg: "bg-yellow-900/30",
    border: "border-yellow-600/50",
    text: "text-yellow-400",
    iconColor: "text-yellow-500",
  },
  warning: {
    icon: ShieldAlert,
    label: "WARNING",
    bg: "bg-orange-900/30",
    border: "border-orange-600/50",
    text: "text-orange-400",
    iconColor: "text-orange-500",
  },
  critical: {
    icon: Ban,
    label: "CRITICAL",
    bg: "bg-red-900/40",
    border: "border-red-600/50",
    text: "text-red-400",
    iconColor: "text-red-500",
  },
};

export default function VendorWarningBanner({ level, message }) {
  if (!level || level === "none" || !message) return null;
  const config = WARNING_CONFIG[level];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border p-3 flex items-start gap-2.5", config.bg, config.border)}>
      <Icon className={cn("w-4.5 h-4.5 shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1 min-w-0">
        <span className={cn("text-[10px] font-bold uppercase tracking-widest", config.text)}>
          {config.label}
        </span>
        <p className={cn("text-sm mt-0.5 whitespace-pre-wrap", config.text)}>{message}</p>
      </div>
    </div>
  );
}