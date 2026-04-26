import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { getSubtreeIds, buildHierarchicalOptions, buildGroupsById } from "@/components/supply/vendorGroupHierarchy";

/**
 * Shared hook — fetches ServiceVendors + SERVICE VendorGroups,
 * builds group-aware lookup structures with hierarchy support.
 *
 * Returns:
 *  - vendors: all active ServiceVendor[]
 *  - vendorGroups: VendorGroup[] (SERVICE type only, flat)
 *  - groupsMap: Map<groupId, VendorGroup>
 *  - vendorsByGroup: Map<groupId, ServiceVendor[]>
 *  - ungroupedVendors: ServiceVendor[] with no group
 *  - getVendorsForServiceGroup(serviceGroupId): ServiceVendor[] — includes subtree
 *  - hierarchicalOptions: { id, label, depth, isRoot }[] for dropdowns
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

  // Hierarchical options for dropdowns
  const hierarchicalOptions = useMemo(
    () => buildHierarchicalOptions(vendorGroups, "SERVICE"),
    [vendorGroups]
  );

  // Get all vendors within a service group's subtree (root + descendants)
  const getVendorsForServiceGroup = useMemo(() => {
    return (serviceGroupId) => {
      if (!serviceGroupId) return [];
      const subtreeIds = getSubtreeIds(serviceGroupId, vendorGroups);
      return vendors.filter(v => v.vendor_group_id && subtreeIds.has(v.vendor_group_id));
    };
  }, [vendors, vendorGroups]);

  return {
    vendors,
    vendorGroups,
    groupsMap,
    vendorsByGroup,
    ungroupedVendors,
    getVendorsForServiceGroup,
    hierarchicalOptions,
    isLoading: loadingV || loadingG,
  };
}