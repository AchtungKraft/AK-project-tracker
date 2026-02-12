import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PART_TYPES,
  PART_TYPE_LABELS,
  PART_TYPE_COLORS,
  PART_TYPE_DEFAULTS,
} from "./partTypeBehavior";
import {
  Package,
  Wrench,
  User,
  RotateCcw,
  Warehouse,
  Shield,
} from "lucide-react";

const PART_TYPE_ICONS = {
  [PART_TYPES.PURCHASED_VENDOR]: Package,
  [PART_TYPES.AK_MANUFACTURED]: Wrench,
  [PART_TYPES.CLIENT_SUPPLIED]: User,
  [PART_TYPES.TAKE_OFF]: RotateCcw,
  [PART_TYPES.STOCK_AK]: Warehouse,
  [PART_TYPES.WARRANTY_REPLACEMENT]: Shield,
};

const PART_TYPE_DESCRIPTIONS = {
  [PART_TYPES.PURCHASED_VENDOR]: "Purchased from vendor, requires PO and payment",
  [PART_TYPES.AK_MANUFACTURED]: "Manufactured in-house, uses production cost",
  [PART_TYPES.CLIENT_SUPPLIED]: "Supplied by client, may have handling fee",
  [PART_TYPES.TAKE_OFF]: "Removed part, potential resale value",
  [PART_TYPES.STOCK_AK]: "AK stock inventory part",
  [PART_TYPES.WARRANTY_REPLACEMENT]: "Warranty replacement, no billing",
};

/**
 * PartTypeSelector
 * Dropdown selector for part type with visual indicators
 */
export default function PartTypeSelector({
  value,
  onChange,
  disabled = false,
  showDescription = true,
  showBehaviorFlags = false,
  className,
}) {
  const selectedType = value || PART_TYPES.PURCHASED_VENDOR;
  const Icon = PART_TYPE_ICONS[selectedType];
  const behavior = PART_TYPE_DEFAULTS[selectedType];

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-gray-300">Part Type *</Label>
      
      <Select value={selectedType} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
          <SelectValue>
            <div className="flex items-center gap-2">
              {Icon && <Icon className="w-4 h-4" />}
              <span>{PART_TYPE_LABELS[selectedType]}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.values(PART_TYPES).map((type) => {
            const TypeIcon = PART_TYPE_ICONS[type];
            return (
              <SelectItem key={type} value={type}>
                <div className="flex items-center gap-2">
                  {TypeIcon && <TypeIcon className="w-4 h-4" />}
                  <span>{PART_TYPE_LABELS[type]}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {showDescription && (
        <p className="text-xs text-gray-500">{PART_TYPE_DESCRIPTIONS[selectedType]}</p>
      )}

      {showBehaviorFlags && behavior && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {behavior.requires_vendor_purchase && (
            <Badge variant="outline" className="text-xs bg-blue-900/30 border-blue-700 text-blue-300">
              Requires PO
            </Badge>
          )}
          {behavior.requires_vendor_payment && (
            <Badge variant="outline" className="text-xs bg-green-900/30 border-green-700 text-green-300">
              Vendor Payment
            </Badge>
          )}
          {behavior.requires_client_billing && (
            <Badge variant="outline" className="text-xs bg-purple-900/30 border-purple-700 text-purple-300">
              Client Billing
            </Badge>
          )}
          {behavior.affects_inventory && (
            <Badge variant="outline" className="text-xs bg-amber-900/30 border-amber-700 text-amber-300">
              Tracks Inventory
            </Badge>
          )}
          {behavior.affects_margin && (
            <Badge variant="outline" className="text-xs bg-cyan-900/30 border-cyan-700 text-cyan-300">
              Affects Margin
            </Badge>
          )}
          {behavior.is_asset_recovery && (
            <Badge variant="outline" className="text-xs bg-red-900/30 border-red-700 text-red-300">
              Asset Recovery
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * PartTypeBadge
 * Display-only badge showing part type
 */
export function PartTypeBadge({ partType, size = "default" }) {
  const type = partType || PART_TYPES.PURCHASED_VENDOR;
  const Icon = PART_TYPE_ICONS[type];
  const colorClass = PART_TYPE_COLORS[type];

  return (
    <Badge
      className={cn(
        colorClass,
        "text-white",
        size === "sm" && "text-xs px-1.5 py-0.5"
      )}
    >
      <div className="flex items-center gap-1">
        {Icon && <Icon className={cn("w-3 h-3", size === "sm" && "w-2.5 h-2.5")} />}
        <span>{PART_TYPE_LABELS[type]}</span>
      </div>
    </Badge>
  );
}