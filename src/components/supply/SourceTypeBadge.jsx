import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, User, Wrench, RotateCcw } from "lucide-react";

/**
 * SourceTypeBadge - Display supply source type
 * 
 * SHOP_PURCHASED - Normal vendor purchase
 * CLIENT_SUPPLIED - Client provides part
 * AK_CUSTOM - AK manufactures/builds internally
 * TAKE_OFF - Part removed from vehicle
 */

const SOURCE_CONFIG = {
  SHOP_PURCHASED: {
    label: 'Shop Purchased',
    shortLabel: 'Purchase',
    icon: ShoppingCart,
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  CLIENT_SUPPLIED: {
    label: 'Client Supplied',
    shortLabel: 'Client',
    icon: User,
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  AK_CUSTOM: {
    label: 'AK Custom',
    shortLabel: 'Custom',
    icon: Wrench,
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  TAKE_OFF: {
    label: 'Take-Off',
    shortLabel: 'Take-Off',
    icon: RotateCcw,
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
};

export default function SourceTypeBadge({ sourceType, compact = false, className }) {
  const config = SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.SHOP_PURCHASED;
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-normal gap-1",
        config.className,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}

/**
 * SourceTypeIcon - Just the icon with tooltip
 */
export function SourceTypeIcon({ sourceType, className }) {
  const config = SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.SHOP_PURCHASED;
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center justify-center", className)} title={config.label}>
      <Icon className={cn("w-4 h-4", config.className.replace('bg-', 'text-').split(' ')[1])} />
    </div>
  );
}

/**
 * getSourceTypeInfo - Get config for a source type
 */
export function getSourceTypeInfo(sourceType) {
  return SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.SHOP_PURCHASED;
}