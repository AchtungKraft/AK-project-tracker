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
   * Match a VendorGroup to a Service using preferred_vendor_group_id (canonical only).
   * No fuzzy fallback — the relationship is enforced.
   */
  const matchGroupForService = (service) => {
    if (!service) return null;
    if (service.preferred_vendor_group_id) {
      return groupsMap.get(service.preferred_vendor_group_id) || null;
    }
    return null;
  };

  /**
   * Get filtered vendors for a service — LOCKED to the service's vendor group.
   * No fallback to all vendors.
   */
  const getFilteredVendors = (service) => {
    if (!service) return { vendors: [], matchedGroup: null };

    const matchedGroup = matchGroupForService(service);

    if (matchedGroup) {
      const groupVendors = vendorsByGroup.get(matchedGroup.id) || [];
      return { vendors: groupVendors, matchedGroup };
    }

    // No group assigned — return empty (should not happen with enforced schema)
    return { vendors: [], matchedGroup: null };
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