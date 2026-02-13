import React from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * InvoiceAgingBadge - Shows invoice aging status
 * 
 * - 0-7 days: Green (Current)
 * - 7-14 days: Yellow (Due Soon)
 * - 14+ days: Red (Overdue)
 */

export default function InvoiceAgingBadge({ createdDate, status }) {
  // If already paid, show success
  if (status === 'paid') {
    return (
      <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Paid
      </Badge>
    );
  }

  // If voided, show neutral
  if (status === 'voided') {
    return (
      <Badge className="bg-gray-600/20 text-gray-400 border border-gray-600/30 gap-1">
        Voided
      </Badge>
    );
  }

  // Calculate days since creation
  const created = new Date(createdDate);
  const now = new Date();
  const daysSince = Math.floor((now - created) / (1000 * 60 * 60 * 24));

  let config;
  if (daysSince <= 7) {
    config = {
      icon: Clock,
      label: daysSince === 0 ? 'Today' : `${daysSince}d`,
      color: 'bg-green-600/20 text-green-400 border-green-600/30',
    };
  } else if (daysSince <= 14) {
    config = {
      icon: Clock,
      label: `${daysSince}d`,
      color: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    };
  } else {
    config = {
      icon: AlertTriangle,
      label: `${daysSince}d`,
      color: 'bg-red-600/20 text-red-400 border-red-600/30',
    };
  }

  const Icon = config.icon;

  return (
    <Badge className={cn("gap-1 border", config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

// Helper function to get aging category
export function getAgingCategory(createdDate) {
  const created = new Date(createdDate);
  const now = new Date();
  const daysSince = Math.floor((now - created) / (1000 * 60 * 60 * 24));

  if (daysSince <= 7) return 'current';
  if (daysSince <= 14) return 'due_soon';
  return 'overdue';
}