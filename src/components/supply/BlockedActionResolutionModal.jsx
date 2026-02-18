import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Store, 
  CreditCard, 
  Hash, 
  RefreshCw,
  Wrench,
  ChevronRight,
  Package
} from 'lucide-react';

// Reason code configuration with icons, labels, and fix guidance
const REASON_CONFIG = {
  MISSING_VENDOR: {
    icon: Store,
    label: 'Missing Vendor',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    guidance: 'Assign a vendor to this part to enable ordering.',
    fixLabel: 'Assign Vendor'
  },
  BILLING_NOT_PAID: {
    icon: CreditCard,
    label: 'Billing Not Paid',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    guidance: 'Client payment required before ordering. Allocate from a billing pool or mark as paid.',
    fixLabel: 'Resolve Billing'
  },
  QTY_TO_ORDER_ZERO: {
    icon: Hash,
    label: 'No Quantity to Order',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    guidance: 'This commitment has no remaining quantity to order. Adjust quantities if needed.',
    fixLabel: 'Adjust Quantity'
  },
  INVARIANT_DRIFT: {
    icon: RefreshCw,
    label: 'Data Drift Detected',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    guidance: 'Commitment quantities are out of sync. Review coverage diagnostics.',
    fixLabel: 'Review Coverage'
  },
  ALREADY_ORDERED: {
    icon: Package,
    label: 'Already Ordered',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    guidance: 'This commitment already has an active order.',
    fixLabel: null // No fix action
  },
  UNKNOWN: {
    icon: AlertTriangle,
    label: 'Unknown Issue',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    guidance: 'An unexpected issue prevented this order. Contact support if this persists.',
    fixLabel: null
  }
};

function getReasonConfig(reasonCode) {
  return REASON_CONFIG[reasonCode] || REASON_CONFIG.UNKNOWN;
}

function BlockedItemCard({ item, onFix }) {
  const reasonCode = item.reason_code || 'UNKNOWN';
  const config = getReasonConfig(reasonCode);
  const Icon = config.icon;
  const partName = item.part_name || item.part?.part_name || 'Unknown Part';
  const message = item.message || item.reason || config.guidance;

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-gray-700/50">
            <Icon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">{partName}</p>
            <Badge className={`${config.color} text-xs mt-1`}>
              {config.label}
            </Badge>
          </div>
        </div>
        {config.fixLabel && onFix && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={() => onFix(item.commitment_id, reasonCode)}
          >
            <Wrench className="w-3 h-3" />
            {config.fixLabel}
            <ChevronRight className="w-3 h-3" />
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-400 pl-11">{message}</p>
    </div>
  );
}

function GroupedBlockedItems({ reasonCode, items, onFix }) {
  const config = getReasonConfig(reasonCode);
  const Icon = config.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">{config.label}</span>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        {config.fixLabel && items.length > 1 && onFix && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1 h-7"
            onClick={() => items.forEach(item => onFix(item.commitment_id, reasonCode))}
          >
            Fix All ({items.length})
          </Button>
        )}
      </div>
      <div className="space-y-2 pl-6">
        {items.map((item, idx) => (
          <BlockedItemCard key={item.commitment_id || idx} item={item} onFix={onFix} />
        ))}
      </div>
    </div>
  );
}

export default function BlockedActionResolutionModal({
  blocked = [],
  projectId,
  vendors,
  onClose,
  onResolved,
  onResolveVendor,
  onResolveBilling,
  onResolveQty,
  onResolveInvariant
}) {
  // Group blocked items by reason_code
  const groupedBlocked = useMemo(() => {
    const groups = {};
    for (const item of blocked) {
      const code = item.reason_code || 'UNKNOWN';
      if (!groups[code]) groups[code] = [];
      groups[code].push(item);
    }
    return groups;
  }, [blocked]);

  const reasonCodes = Object.keys(groupedBlocked);

  // Unified fix handler that routes to appropriate resolver
  const handleFix = (commitmentId, reasonCode) => {
    switch (reasonCode) {
      case 'MISSING_VENDOR':
        onResolveVendor?.(commitmentId);
        onClose();
        break;
      case 'BILLING_NOT_PAID':
        onResolveBilling?.(commitmentId);
        onClose();
        break;
      case 'QTY_TO_ORDER_ZERO':
        onResolveQty?.(commitmentId);
        onClose();
        break;
      case 'INVARIANT_DRIFT':
        onResolveInvariant?.(commitmentId);
        onClose();
        break;
      default:
        // No action for unknown codes
        break;
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            {blocked.length} Item{blocked.length !== 1 ? 's' : ''} Blocked
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Summary banner */}
          <div className="p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
            <p className="text-sm text-yellow-300">
              The following items could not be added to a purchase order. 
              Use the "Fix" buttons to resolve each issue.
            </p>
          </div>

          {/* Grouped by reason code if multiple types, otherwise flat list */}
          {reasonCodes.length > 1 ? (
            <div className="space-y-4">
              {reasonCodes.map(code => (
                <GroupedBlockedItems
                  key={code}
                  reasonCode={code}
                  items={groupedBlocked[code]}
                  onFix={handleFix}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {blocked.map((item, idx) => (
                <BlockedItemCard 
                  key={item.commitment_id || idx} 
                  item={item} 
                  onFix={handleFix}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
          <Button variant="outline" onClick={onClose}>
            Dismiss
          </Button>
          {onResolved && (
            <Button onClick={onResolved}>
              Done - Refresh Data
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}