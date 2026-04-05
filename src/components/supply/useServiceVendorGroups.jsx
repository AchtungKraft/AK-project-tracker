import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

/**
 * Shared hook — fetches ServiceVendors + SERVICE VendorGroups,
 * builds group-aware lookup structures.
 *
 * Consumers should use service.preferred_vendor_group_id directly
 * to look up vendors via vendorsByGroup.get(groupId).
 *
 * Returns:
 *  - vendors: all active ServiceVendor[]
 *  - vendorGroups: VendorGroup[] (SERVICE type only)
 *  - groupsMap: Map<groupId, VendorGroup>
 *  - vendorsByGroup: Map<groupId, ServiceVendor[]>
 *  - ungroupedVendors: ServiceVendor[] with no group
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

  return {
    vendors,
    vendorGroups,
    groupsMap,
    vendorsByGroup,
    ungroupedVendors,
    isLoading: loadingV || loadingG,
  };
}