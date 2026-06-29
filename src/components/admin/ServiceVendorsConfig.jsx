import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Truck, Globe, Phone, Smartphone, Users, Search, X, AlertTriangle, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildHierarchicalOptions } from "@/components/supply/vendorGroupHierarchy";
import ServiceVendorDetailModal from "./ServiceVendorDetailModal";
import VendorStatusBadge from "./vendor/VendorStatusBadge";
import { VendorCapabilityTagsDisplay } from "./vendor/VendorCapabilityTags";

// Searchable text fields
const SEARCH_FIELDS = [
  "name", "contact_name", "contact_email", "notes",
  "service_capabilities", "preferred_use_cases", "vendor_instructions",
  "pricing_notes", "scheduling_notes", "internal_warnings",
  "insurance_compliance_notes", "address", "lead_time_notes",
  "internal_warning_message",
];

function vendorMatchesSearch(vendor, query) {
  if (!query) return true;
  const lower = query.toLowerCase();

  // Search text fields
  if (SEARCH_FIELDS.some(field => {
    const val = vendor[field];
    return val && typeof val === "string" && val.toLowerCase().includes(lower);
  })) return true;

  // Search capability tags
  if (vendor.capability_tags?.some(tag => tag.toLowerCase().includes(lower))) return true;

  // Search vendor status
  if (vendor.vendor_status && vendor.vendor_status.replace(/_/g, " ").includes(lower)) return true;

  return false;
}

// Warning level indicator for list view
const WARNING_INDICATORS = {
  caution: { icon: "⚠", color: "text-yellow-500" },
  warning: { icon: "🔶", color: "text-orange-500" },
  critical: { icon: "🔴", color: "text-red-500" },
};

export default function ServiceVendorsConfig() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["serviceVendors-admin"],
    queryFn: () => base44.entities.ServiceVendor.list(),
  });

  const { data: vendorGroups = [] } = useQuery({
    queryKey: ["vendorGroups-service"],
    queryFn: async () => {
      const all = await base44.entities.VendorGroup.filter({ vendor_type: "SERVICE", is_active: true });
      return all.sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));
    },
  });
  const groupsMap = new Map(vendorGroups.map(g => [g.id, g]));

  const hierarchicalLabels = useMemo(() => {
    const opts = buildHierarchicalOptions(vendorGroups, "SERVICE");
    const map = new Map();
    for (const o of opts) map.set(o.id, o.label);
    return map;
  }, [vendorGroups]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["serviceVendors-admin"] });
    queryClient.invalidateQueries({ queryKey: ["serviceVendors"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceVendor.delete(id),
    onSuccess: () => { invalidateAll(); toast.success("Service vendor deleted"); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.ServiceVendor.update(id, { is_active }),
    onSuccess: () => { invalidateAll(); },
  });

  const openCreate = () => { setEditingVendor(null); setModalOpen(true); };
  const openEdit = (vendor) => { setEditingVendor(vendor); setModalOpen(true); };

  const filteredVendors = useMemo(() => {
    return vendors.filter(v => vendorMatchesSearch(v, searchQuery));
  }, [vendors, searchQuery]);

  const activeVendors = filteredVendors.filter(v => v.is_active !== false);
  const inactiveVendors = filteredVendors.filter(v => v.is_active === false);

  const vendorsByGroup = useMemo(() => {
    const map = new Map();
    const ungrouped = [];
    for (const v of activeVendors) {
      if (v.vendor_group_id && groupsMap.has(v.vendor_group_id)) {
        if (!map.has(v.vendor_group_id)) map.set(v.vendor_group_id, []);
        map.get(v.vendor_group_id).push(v);
      } else {
        ungrouped.push(v);
      }
    }
    return { grouped: map, ungrouped };
  }, [activeVendors, groupsMap]);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-400" />
              Service Vendors
            </CardTitle>
            <p className="text-sm text-gray-400 mt-1">
              Vendors are organized by Vendor Group. Each vendor belongs to exactly one group.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Service Vendor
          </Button>
        </div>
        {vendors.length > 0 && (
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search vendors, capabilities, tags, warnings, ratings..."
              className="bg-gray-800 border-gray-700 text-white pl-9 pr-8 h-9"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : searchQuery && activeVendors.length === 0 && inactiveVendors.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>No vendors match "{searchQuery}"</p>
          </div>
        ) : activeVendors.length === 0 && !searchQuery ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No service vendors yet</p>
            <Button variant="outline" size="sm" onClick={openCreate} className="mt-3 gap-1">
              <Plus className="w-3.5 h-3.5" /> Create First Vendor
            </Button>
          </div>
        ) : (
          <>
            {vendorGroups.map(group => {
              const groupVendors = vendorsByGroup.grouped.get(group.id) || [];
              if (groupVendors.length === 0) return null;
              return (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] border-purple-600/50 text-purple-400">{hierarchicalLabels.get(group.id) || group.name}</Badge>
                    <span className="text-[10px] text-gray-500">{groupVendors.length} vendor{groupVendors.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-2">
                    {groupVendors.map(vendor => (
                      <VendorRow
                        key={vendor.id}
                        vendor={vendor}
                        group={group}
                        onEdit={() => openEdit(vendor)}
                        onToggleActive={() => toggleActiveMutation.mutate({ id: vendor.id, is_active: false })}
                        onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {vendorsByGroup.ungrouped.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] border-red-600/50 text-red-400">No Group Assigned</Badge>
                  <span className="text-[10px] text-gray-500">{vendorsByGroup.ungrouped.length} vendor{vendorsByGroup.ungrouped.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {vendorsByGroup.ungrouped.map(vendor => (
                    <VendorRow
                      key={vendor.id}
                      vendor={vendor}
                      group={null}
                      onEdit={() => openEdit(vendor)}
                      onToggleActive={() => toggleActiveMutation.mutate({ id: vendor.id, is_active: false })}
                      onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {inactiveVendors.length > 0 && (
          <div>
            <Label className="text-gray-400 text-xs mb-3 block">
              Inactive Vendors ({inactiveVendors.length})
            </Label>
            <div className="space-y-2 opacity-60">
              {inactiveVendors.map(vendor => (
                <VendorRow
                  key={vendor.id}
                  vendor={vendor}
                  group={groupsMap.get(vendor.vendor_group_id) || null}
                  onEdit={() => openEdit(vendor)}
                  onToggleActive={() => toggleActiveMutation.mutate({ id: vendor.id, is_active: true })}
                  onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                  isInactive
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {modalOpen && (
        <ServiceVendorDetailModal
          vendor={editingVendor}
          vendorGroups={vendorGroups}
          onClose={() => { setModalOpen(false); setEditingVendor(null); }}
          onSuccess={() => { invalidateAll(); setModalOpen(false); setEditingVendor(null); }}
        />
      )}
    </Card>
  );
}

/** Compact vendor row display */
function VendorRow({ vendor, group, onEdit, onToggleActive, onDelete, isInactive = false }) {
  const hasDetails = vendor.service_capabilities || vendor.preferred_use_cases || vendor.vendor_instructions || vendor.pricing_notes || vendor.scheduling_notes || vendor.internal_warnings || vendor.insurance_compliance_notes;
  const warningIndicator = WARNING_INDICATORS[vendor.internal_warning_level];
  const hasRatings = vendor.quality_rating || vendor.speed_rating || vendor.communication_rating || vendor.value_rating;
  const avgRating = hasRatings
    ? (([vendor.quality_rating, vendor.speed_rating, vendor.communication_rating, vendor.value_rating].filter(Boolean).reduce((a, b) => a + b, 0)) / [vendor.quality_rating, vendor.speed_rating, vendor.communication_rating, vendor.value_rating].filter(Boolean).length).toFixed(1)
    : null;

  return (
    <div className={cn(
      "p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors flex items-start gap-3",
      vendor.vendor_status === "do_not_use" && "border border-red-900/40",
      vendor.vendor_status === "probation" && "border border-orange-900/30",
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {warningIndicator && (
            <span className={cn("text-sm", warningIndicator.color)}>{warningIndicator.icon}</span>
          )}
          <span className="font-medium text-white">{vendor.name}</span>
          <VendorStatusBadge status={vendor.vendor_status} />
          {hasDetails && (
            <Badge variant="outline" className="text-[10px] border-blue-600/40 text-blue-400">Details</Badge>
          )}
          {!group && (
            <Badge variant="outline" className="text-[10px] border-red-600/50 text-red-400">No Group!</Badge>
          )}
          {isInactive && (
            <Badge variant="outline" className="text-[10px] bg-gray-800 text-gray-500 border-gray-700">Inactive</Badge>
          )}
          {avgRating && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
              <Star className="w-3 h-3 fill-amber-400" />
              {avgRating}
            </span>
          )}
          {vendor.typical_lead_time_days != null && (
            <span className="text-[10px] text-gray-500">{vendor.typical_lead_time_days}d lead</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-sm text-gray-400">
          {vendor.contact_name && <span>{vendor.contact_name}</span>}
          {vendor.contact_email && <span>{vendor.contact_email}</span>}
          {vendor.contact_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.contact_phone}</span>}
          {vendor.cell_phone && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{vendor.cell_phone}</span>}
        </div>
        {vendor.address && <p className="text-xs text-gray-500 mt-0.5">{vendor.address}</p>}
        {vendor.website && (
          <a href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-0.5 flex items-center gap-1">
            <Globe className="w-3 h-3" />{vendor.website}
          </a>
        )}
        {vendor.capability_tags?.length > 0 && (
          <div className="mt-1.5">
            <VendorCapabilityTagsDisplay tags={vendor.capability_tags} />
          </div>
        )}
        {vendor.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{vendor.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={onToggleActive} className="h-8 w-8 text-gray-400" title={isInactive ? "Activate" : "Deactivate"}>
          <span className="text-xs">{isInactive ? "○" : "✓"}</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={onEdit} className="h-8 w-8 text-blue-400">
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} className="h-8 w-8 text-red-400">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}