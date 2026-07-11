import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Users,
  FolderKanban,
  Package,
  Truck,
  DollarSign,
  Car,
  Mail,
  ChevronDown,
  ChevronRight,
  MapPin,
  ListChecks,
  Tag,
  Layers,
  Settings,
  Wrench,
  Shield,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_GROUPS = [
  {
    key: "organization",
    label: "Organization",
    icon: Users,
    color: "text-blue-400",
    items: [
      { key: "users", label: "Users" },
      { key: "team-members", label: "Team Members" },
      { key: "locations", label: "Locations" },
      { key: "storage-templates", label: "Storage Templates" },
    ],
  },
  {
    key: "project-structure",
    label: "Project Structure",
    icon: FolderKanban,
    color: "text-purple-400",
    items: [
      { key: "project-types", label: "Project Types" },
      { key: "task-categories", label: "Task Categories" },
      { key: "statuses", label: "Status Lists" },
    ],
  },
  {
    key: "products-services",
    label: "Products & Services",
    icon: Package,
    color: "text-green-400",
    items: [
      { key: "part-categories", label: "Part Categories" },
      { key: "service-catalog", label: "Services (by Group)" },
      { key: "vendor-groups", label: "Vendor Groups" },
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    icon: Truck,
    color: "text-orange-400",
    items: [
      { key: "vendors", label: "Part Vendors" },
      { key: "service-vendors", label: "Service Vendors" },
    ],
  },
  {
    key: "pricing",
    label: "Pricing",
    icon: DollarSign,
    color: "text-emerald-400",
    items: [
      { key: "pricing-matrix", label: "Pricing Matrix" },
      { key: "pricing-guardrails", label: "Pricing Guardrails" },
    ],
  },
  {
    key: "vehicle-data",
    label: "Vehicle Data",
    icon: Car,
    color: "text-red-400",
    items: [
      { key: "car-makes", label: "Car Makes" },
      { key: "car-models", label: "Car Models" },
      { key: "car-years", label: "Car Years" },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    icon: Mail,
    color: "text-cyan-400",
    items: [
      { key: "email-templates", label: "Email Templates" },
    ],
  },
];

export { ADMIN_GROUPS };

export default function AdminSidebar({ activeKey, onSelect }) {
  // All groups expanded by default — find which group contains the active key
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const initial = {};
    ADMIN_GROUPS.forEach(g => { initial[g.key] = true; });
    return initial;
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleSelect = (itemKey) => {
    onSelect(itemKey);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <nav className="space-y-1 py-2">
      {ADMIN_GROUPS.map((group) => {
        const Icon = group.icon;
        const isExpanded = expandedGroups[group.key];
        const hasActiveItem = group.items.some(i => i.key === activeKey);

        return (
          <div key={group.key}>
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.key)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                hasActiveItem ? "text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", group.color)} />
              <span className="flex-1 text-left">{group.label}</span>
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              }
            </button>

            {/* Group Items */}
            {isExpanded && (
              <div className="ml-6 border-l border-gray-800 space-y-0.5 py-0.5">
                {group.items.map((item) => {
                  const isActive = item.key === activeKey;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleSelect(item.key)}
                      className={cn(
                        "w-full text-left pl-3 pr-2 py-1.5 text-sm rounded-r-md transition-colors",
                        isActive
                          ? "bg-red-600/20 text-red-400 border-l-2 border-red-500 -ml-px font-medium"
                          : "text-gray-400 hover:text-white hover:bg-gray-800/40"
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="md:hidden mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="border-gray-700 text-gray-300 gap-2"
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          {mobileOpen ? "Close Menu" : "Admin Menu"}
        </Button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-gray-900 border-r border-gray-800 overflow-y-auto p-2"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-gray-800 mb-2">
              <span className="text-white font-semibold text-sm">Admin Menu</span>
              <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:block w-56 shrink-0 bg-black/30 border border-gray-800 rounded-lg overflow-y-auto max-h-[calc(100vh-10rem)]">
        {sidebarContent}
      </div>
    </>
  );
}