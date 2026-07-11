import {
  Warehouse, Building2, DoorOpen, LayoutGrid, Columns3, Server,
  Layers, Box, Archive, GripHorizontal, Truck, ShoppingCart,
  Wrench, PackageOpen, Frame, Container, Cog, MapPin,
  CircleDot, ArrowDownToLine, ArrowUpFromLine, Search, Monitor,
  Combine, Clock, HelpCircle
} from "lucide-react";

const TYPE_CONFIG = {
  warehouse:       { label: "Warehouse",        icon: Warehouse,        color: "#3B82F6", group: "structure" },
  building:        { label: "Building",          icon: Building2,        color: "#6366F1", group: "structure" },
  room:            { label: "Room",              icon: DoorOpen,         color: "#8B5CF6", group: "structure" },
  area:            { label: "Area",              icon: LayoutGrid,       color: "#A78BFA", group: "structure" },
  aisle:           { label: "Aisle",             icon: Columns3,         color: "#60A5FA", group: "storage" },
  rack:            { label: "Rack",              icon: Server,           color: "#F59E0B", group: "storage" },
  shelf:           { label: "Shelf",             icon: Layers,           color: "#10B981", group: "storage" },
  bin:             { label: "Bin",               icon: Box,              color: "#14B8A6", group: "storage" },
  cabinet:         { label: "Cabinet",           icon: Archive,          color: "#64748B", group: "storage" },
  drawer:          { label: "Drawer",            icon: GripHorizontal,   color: "#94A3B8", group: "storage" },
  trailer:         { label: "Trailer",           icon: Truck,            color: "#EF4444", group: "mobile" },
  cart:            { label: "Cart",              icon: ShoppingCart,      color: "#F97316", group: "mobile" },
  engine_cart:     { label: "Engine Cart",       icon: Cog,              color: "#DC2626", group: "mobile" },
  body_cart:       { label: "Body Cart",         icon: Frame,            color: "#EA580C", group: "mobile" },
  tech_cart:       { label: "Tech Cart",         icon: Wrench,           color: "#D97706", group: "mobile" },
  pallet:          { label: "Pallet",            icon: PackageOpen,      color: "#78716C", group: "container" },
  tote:            { label: "Tote",              icon: Container,        color: "#A3E635", group: "container" },
  stand:           { label: "Stand",             icon: Frame,            color: "#FBBF24", group: "container" },
  crate:           { label: "Crate",             icon: Box,              color: "#92400E", group: "container" },
  project_storage: { label: "Project Storage",   icon: CircleDot,        color: "#E879F9", group: "workflow" },
  staging:         { label: "Staging",           icon: Clock,            color: "#38BDF8", group: "workflow" },
  receiving:       { label: "Receiving",         icon: ArrowDownToLine,  color: "#22D3EE", group: "workflow" },
  shipping:        { label: "Shipping",          icon: ArrowUpFromLine,  color: "#2DD4BF", group: "workflow" },
  inspection:      { label: "Inspection",        icon: Search,           color: "#FACC15", group: "workflow" },
  workstation:     { label: "Workstation",       icon: Monitor,          color: "#818CF8", group: "workflow" },
  assembly:        { label: "Assembly",          icon: Combine,          color: "#C084FC", group: "workflow" },
  temporary:       { label: "Temporary",         icon: Clock,            color: "#FB923C", group: "workflow" },
  other:           { label: "Other",             icon: HelpCircle,       color: "#6B7280", group: "other" },
};

const FALLBACK = { label: "Location", icon: MapPin, color: "#8B5CF6", group: "other" };

export function getLocationTypeConfig(type) {
  return TYPE_CONFIG[type] || FALLBACK;
}

export function getLocationTypeOptions() {
  const groups = [
    { key: "structure", label: "Structure" },
    { key: "storage",   label: "Storage" },
    { key: "mobile",    label: "Mobile" },
    { key: "container", label: "Container" },
    { key: "workflow",  label: "Workflow" },
    { key: "other",     label: "Other" },
  ];

  const result = [];
  groups.forEach(g => {
    Object.entries(TYPE_CONFIG)
      .filter(([, cfg]) => cfg.group === g.key)
      .forEach(([value, cfg]) => {
        result.push({ value, label: cfg.label, color: cfg.color, group: g.label });
      });
  });
  return result;
}