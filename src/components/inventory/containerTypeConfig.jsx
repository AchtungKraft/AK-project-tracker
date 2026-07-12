import { Box, Briefcase, Inbox, Grid3X3, LayoutGrid, Package, ShoppingCart, HelpCircle } from "lucide-react";

const CONTAINER_TYPES = {
  box:       { label: 'Box',       icon: Box,         color: '#8B5CF6' },
  tote:      { label: 'Tote',      icon: Briefcase,   color: '#6366F1' },
  bin:       { label: 'Bin',       icon: Inbox,       color: '#3B82F6' },
  tray:      { label: 'Tray',      icon: LayoutGrid,  color: '#06B6D4' },
  organizer: { label: 'Organizer', icon: Grid3X3,     color: '#10B981' },
  crate:     { label: 'Crate',     icon: Package,     color: '#F59E0B' },
  cart:      { label: 'Cart',      icon: ShoppingCart, color: '#EF4444' },
  other:     { label: 'Other',     icon: HelpCircle,  color: '#6B7280' },
};

export function getContainerTypeConfig(type) {
  return CONTAINER_TYPES[type] || CONTAINER_TYPES.other;
}

export function getContainerTypeOptions() {
  return Object.entries(CONTAINER_TYPES).map(([key, cfg]) => ({
    value: key, label: cfg.label, icon: cfg.icon, color: cfg.color,
  }));
}

export default CONTAINER_TYPES;