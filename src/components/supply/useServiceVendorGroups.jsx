import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

/**
 * Shared hook — fetches ServiceVendors + SERVICE VendorGroups,
 * builds group-aware lookup structures.
 *
 * Returns:
 *  - vendors: all active ServiceVendor[]
 *  - vendorGroups: VendorGroup[] (SERVICE type only)
 *  - groupsMap: Map<groupId, VendorGroup>
 *  - vendorsByGroup: Map<groupId, ServiceVendor[]>
 *  - ungroupedVendors: ServiceVendor[] with no group
 *  - getFilteredVendors(service): priority-ordered vendor list for a service
 *  - matchGroupForService(service): best-match VendorGroup for a service
 *  - isLoading
 */
export default function useServiceVendorGroups() {
  const { data: vendors = [], isLoading: loadingV } = useQuery({
    queryKey: ["serviceVendors"],
    queryFn: () => base44.entities.ServiceVendor.filter({ is_active: true }),
  });

  const { data: vendorGroups = [], isLoading: loadingG } = useQuery({
    queryKey: ["vendorGroups-service"],
    queryFn: async () => {
      const all = await base44.entities.VendorGroup.filter({ vendor_type: "SERVICE", is_active: true });
      return all.sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));
    },
  });

  const groupsMap = useMemo(() => new Map(vendorGroups.map(g => [g.id, g])), [vendorGroups]);

  const vendorsByGroup = useMemo(() => {
    const map = new Map();
    for (const v of vendors) {
      const gid = v.vendor_group_id || "__ungrouped__";
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid).push(v);
    }
    return map;
  }, [vendors]);

  const ungroupedVendors = useMemo(
    () => vendorsByGroup.get("__ungrouped__") || [],
    [vendorsByGroup]
  );

  /**
   * Match a VendorGroup to a Service using:
   * 1. service.preferred_vendor_group_id (canonical)
   * 2. Fuzzy match service.category → group.name (fallback)
   */
  const matchGroupForService = (service) => {
    if (!service) return null;
    // Canonical link
    if (service.preferred_vendor_group_id) {
      return groupsMap.get(service.preferred_vendor_group_id) || null;
    }
    // Fuzzy fallback: category → group name
    if (service.category) {
      const cat = service.category.toLowerCase().replace(/_/g, " ");
      return vendorGroups.find(g =>
        g.name.toLowerCase().includes(cat) || cat.includes(g.name.toLowerCase())
      ) || null;
    }
    return null;
  };

  /**
   * Get filtered vendors for a service with priority:
   * 1. Vendors in matched group
   * 2. Allowed vendors (if service.allowed_vendor_ids is set)
   * 3. All vendors (fallback)
   *
   * Returns { vendors: ServiceVendor[], matchedGroup: VendorGroup | null }
   */
  const getFilteredVendors = (service) => {
    if (!service) return { vendors, matchedGroup: null };

    const matchedGroup = matchGroupForService(service);

    // Priority 1: Vendors in matched group
    if (matchedGroup) {
      const groupVendors = vendorsByGroup.get(matchedGroup.id) || [];
      if (groupVendors.length > 0) {
        return { vendors: groupVendors, matchedGroup };
      }
    }

    // Priority 2: Allowed vendors
    if (service.allowed_vendor_ids?.length) {
      const allowedSet = new Set(service.allowed_vendor_ids);
      const allowed = vendors.filter(v => allowedSet.has(v.id));
      if (allowed.length > 0) return { vendors: allowed, matchedGroup };
    }

    // Priority 3: All vendors
    return { vendors, matchedGroup };
  };

  return {
    vendors,
    vendorGroups,
    groupsMap,
    vendorsByGroup,
    ungroupedVendors,
    getFilteredVendors,
    matchGroupForService,
    isLoading: loadingV || loadingG,
  };
}