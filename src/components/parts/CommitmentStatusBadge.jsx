import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, Truck, PackageCheck, Package, Wrench, CheckCircle2, 
  XCircle, Archive 
} from "lucide-react";

const STATUS_CONFIG = {
  planned: { 
    label: 'Planned', 
    color: 'border-gray-500 text-gray-400', 
    bg: 'bg-gray-900/30',
    icon: Clock 
  },
  ordered: { 
    label: 'Ordered', 
    color: 'border-purple-500 text-purple-400', 
    bg: 'bg-purple-900/30',
    icon: Truck 
  },
  partially_received: { 
    label: 'Partial Recv', 
    color: 'border-orange-500 text-orange-400', 
    bg: 'bg-orange-900/30',
    icon: PackageCheck 
  },
  received: { 
    label: 'Received', 
    color: 'border-cyan-500 text-cyan-400', 
    bg: 'bg-cyan-900/30',
    icon: PackageCheck 
  },
  allocated: { 
    label: 'Allocated', 
    color: 'border-blue-500 text-blue-400', 
    bg: 'bg-blue-900/30',
    icon: Package 
  },
  installed: { 
    label: 'Installed', 
    color: 'border-green-500 text-green-400', 
    bg: 'bg-green-900/30',
    icon: Wrench 
  },
  closed: { 
    label: 'Closed', 
    color: 'border-gray-600 text-gray-500', 
    bg: 'bg-gray-900/30',
    icon: Archive 
  },
  cancelled: { 
    label: 'Cancelled', 
    color: 'border-red-500 text-red-400', 
    bg: 'bg-red-900/30',
    icon: XCircle 
  },
};

const BILLING_CONFIG = {
  not_billable: { label: 'Not Billable', color: 'border-gray-600 text-gray-500' },
  billable: { label: 'Billable', color: 'border-yellow-600 text-yellow-400' },
  invoiced: { label: 'Invoiced', color: 'border-blue-600 text-blue-400' },
  paid: { label: 'Paid', color: 'border-green-600 text-green-400' },
};

export function CommitmentStatusBadge({ status, showIcon = true, size = 'default' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
  const Icon = config.icon;
  
  return (
    <Badge 
      variant="outline" 
      className={`${config.color} ${size === 'sm' ? 'text-xs px-1.5 py-0' : ''}`}
    >
      {showIcon && <Icon className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} mr-1`} />}
      {config.label}
    </Badge>
  );
}

export function CommitmentBillingBadge({ status, size = 'default' }) {
  const config = BILLING_CONFIG[status] || BILLING_CONFIG.billable;
  
  return (
    <Badge 
      variant="outline" 
      className={`${config.color} ${size === 'sm' ? 'text-xs px-1.5 py-0' : ''}`}
    >
      {config.label}
    </Badge>
  );
}

export function CommitmentSourceBadge({ source }) {
  const labels = {
    migrated_requirement: 'Migrated',
    manual_commitment: 'Manual',
    po_split: 'PO Split',
    stock_buffer: 'Stock Buffer',
  };
  
  return (
    <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
      {labels[source] || source}
    </Badge>
  );
}

export { STATUS_CONFIG, BILLING_CONFIG };