import {
  Warehouse, Building2, DoorOpen, LayoutGrid, Columns3, Server,
  Layers, Box, Archive, GripHorizontal, Truck, ShoppingCart,
  Wrench, PackageOpen, Frame, Container, Cog, MapPin,
  CircleDot, ArrowDownToLine, ArrowUpFromLine, Search, Monitor,
  Combine, Clock, HelpCircle, Hexagon, Target, Bookmark,
  Car, Disc, ShieldCheck
} from "lucide-react";

const TYPE_CONFIG = {
  // Structure
  warehouse:       { label: "Warehouse",         icon: Warehouse,        color: "#3B82F6", group: "structure" },
  building:        { label: "Building",           icon: Building2,        color: "#6366F1", group: "structure" },
  room:            { label: "Room",               icon: DoorOpen,         color: "#8B5CF6", group: "structure" },
  area:            { label: "Area",               icon: LayoutGrid,       color: "#A78BFA", group: "structure" },
  zone:            { label: "Zone",               icon: Hexagon,          color: "#7C3AED", group: "structure" },
  // Storage
  aisle:           { label: "Aisle",              icon: Columns3,         color: "#60A5FA", group: "storage" },
  rack:            { label: "Rack",               icon: Server,           color: "#F59E0B", group: "storage" },
  shelf:           { label: "Shelf",              icon: Layers,           color: "#10B981", group: "storage" },
  bin:             { label: "Bin",                icon: Box,              color: "#14B8A6", group: "storage" },
  cabinet:         { label: "Cabinet",            icon: Archive,          color: "#64748B", group: "storage" },
  drawer:          { label: "Drawer",             icon: GripHorizontal,   color: "#94A3B8", group: "storage" },
  // Mobile
  trailer:         { label: "Trailer",            icon: Truck,            color: "#EF4444", group: "mobile" },
  cart:            { label: "Cart",               icon: ShoppingCart,      color: "#F97316", group: "mobile" },
  engine_cart:     { label: "Engine Cart",        icon: Cog,              color: "#DC2626", group: "mobile" },
  body_cart:       { label: "Body Cart",          icon: Car,              color: "#EA580C", group: "mobile" },
  tech_cart:       { label: "Tech Cart",          icon: Wrench,           color: "#D97706", group: "mobile" },
  // Container
  pallet:          { label: "Pallet",             icon: PackageOpen,      color: "#78716C", group: "container" },
  tote:            { label: "Tote",               icon: Container,        color: "#A3E635", group: "container" },
  parts_tote:      { label: "Parts Tote",         icon: Container,        color: "#84CC16", group: "container" },
  stand:           { label: "Stand",              icon: Frame,            color: "#FBBF24", group: "container" },
  engine_stand:    { label: "Engine Stand",       icon: Disc,             color: "#F59E0B", group: "container" },
  body_buck:       { label: "Body Buck",          icon: Frame,            color: "#FB923C", group: "container" },
  crate:           { label: "Crate",              icon: Box,              color: "#92400E", group: "container" },
  // Workflow
  project_storage: { label: "Project Storage",    icon: CircleDot,        color: "#E879F9", group: "workflow" },
  project_shelf:   { label: "Project Shelf",      icon: Bookmark,         color: "#D946EF", group: "workflow" },
  project_cart:    { label: "Project Cart",       icon: Target,           color: "#C026D3", group: "workflow" },
  staging:         { label: "Staging",            icon: Clock,            color: "#38BDF8", group: "workflow" },
  receiving:       { label: "Receiving",          icon: ArrowDownToLine,  color: "#22D3EE", group: "workflow" },
  shipping:        { label: "Shipping",           icon: ArrowUpFromLine,  color: "#2DD4BF", group: "workflow" },
  inspection:      { label: "Inspection",         icon: ShieldCheck,      color: "#FACC15", group: "workflow" },
  workstation:     { label: "Workstation",        icon: Monitor,          color: "#818CF8", group: "workflow" },
  assembly:        { label: "Assembly",           icon: Combine,          color: "#C084FC", group: "workflow" },
  temporary:       { label: "Temporary",          icon: Clock,            color: "#FB923C", group: "workflow" },
  // Other
  unclassified:    { label: "Unclassified",       icon: MapPin,           color: "#9CA3AF", group: "other" },
  other:           { label: "Other",              icon: HelpCircle,       color: "#6B7280", group: "other" },
};

const FALLBACK = { label: "Location", icon: MapPin, color: "#8B5CF6", group: "other" };

export function getLocationTypeConfig(type) {
  if (!type) return FALLBACK;
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

/** Build the full breadcrumb path for a location. Returns [{id, name, color, type}] root-first. */
export function buildLocationPath(locationId, locations, maxDepth = 10) {
  const path = [];
  let currentId = locationId;
  let depth = 0;
  const visited = new Set();
  while (currentId && depth < maxDepth) {
    if (visited.has(currentId)) break; // cycle guard
    visited.add(currentId);
    const loc = locations.find(l => l.id === currentId);
    if (!loc) break;
    path.unshift({
      id: loc.id,
      name: loc.location_area,
      color: loc.color || '#8B5CF6',
      type: loc.location_type,
      shortCode: loc.short_code,
    });
    currentId = loc.parent_id;
    depth++;
  }
  return path;
}

/** Build a plain-text breadcrumb string like "Building A > Rack 1 > Shelf 2" */
export function buildLocationPathString(locationId, locations) {
  return buildLocationPath(locationId, locations).map(p => p.name).join(' > ');
}

/** Default project storage templates */
export const PROJECT_STORAGE_TEMPLATES = [
  { key: "main_shelf",        label: "Main Shelf",        type: "project_shelf",   sortOrder: 0 },
  { key: "engine_cart",       label: "Engine Cart",       type: "engine_cart",      sortOrder: 1 },
  { key: "body_cart",         label: "Body Cart",         type: "body_cart",        sortOrder: 2 },
  { key: "interior",          label: "Interior",          type: "project_storage",  sortOrder: 3 },
  { key: "hardware",          label: "Hardware",          type: "bin",              sortOrder: 4 },
  { key: "removed_parts",     label: "Removed Parts",     type: "project_storage",  sortOrder: 5 },
  { key: "customer_supplied", label: "Customer Supplied", type: "project_storage",  sortOrder: 6 },
  { key: "ready_to_install",  label: "Ready to Install",  type: "staging",          sortOrder: 7 },
  { key: "inspection",        label: "Inspection",        type: "inspection",       sortOrder: 8 },
  { key: "shipping",          label: "Shipping",          type: "shipping",         sortOrder: 9 },
];