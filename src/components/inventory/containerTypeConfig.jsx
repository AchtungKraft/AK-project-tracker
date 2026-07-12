import { Box, Briefcase, Inbox, Grid3X3, LayoutGrid, Package, ShoppingCart, HelpCircle } from "lucide-react";

const CONTAINER_TYPES = {
  box:       { label: 'Box',       icon: Box,         color: '#8B5CF6', prefix: 'BOX' },
  tote:      { label: 'Tote',      icon: Briefcase,   color: '#6366F1', prefix: 'TOTE' },
  bin:       { label: 'Bin',       icon: Inbox,       color: '#3B82F6', prefix: 'BIN' },
  tray:      { label: 'Tray',      icon: LayoutGrid,  color: '#06B6D4', prefix: 'TRAY' },
  organizer: { label: 'Organizer', icon: Grid3X3,     color: '#10B981', prefix: 'ORG' },
  crate:     { label: 'Crate',     icon: Package,     color: '#F59E0B', prefix: 'CRT' },
  cart:      { label: 'Cart',      icon: ShoppingCart, color: '#EF4444', prefix: 'CART' },
  other:     { label: 'Other',     icon: HelpCircle,  color: '#6B7280', prefix: 'CTR' },
};

export function getContainerTypeConfig(type) {
  return CONTAINER_TYPES[type] || CONTAINER_TYPES.other;
}

export function getContainerTypeOptions() {
  return Object.entries(CONTAINER_TYPES).map(([key, cfg]) => ({
    value: key, label: cfg.label, icon: cfg.icon, color: cfg.color, prefix: cfg.prefix,
  }));
}

/** Generate a container number like TOTE-014 from type + existing containers */
export function generateContainerNumber(containerType, existingContainers = []) {
  const tc = CONTAINER_TYPES[containerType] || CONTAINER_TYPES.other;
  const prefix = tc.prefix;
  // Find the highest existing number for this prefix
  let maxNum = 0;
  existingContainers.forEach(c => {
    const code = c.short_code || '';
    const match = code.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  const nextNum = maxNum + 1;
  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}

export default CONTAINER_TYPES;