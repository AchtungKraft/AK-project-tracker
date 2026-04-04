/**
 * getVendorSuggestions.js
 * Phase 2: Returns parts with to_order > 0 that are compatible with a selected vendor.
 * Used by PO creation UI to show "what else can I order from this vendor?"
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendor_id, project_id } = await req.json();
    if (!vendor_id) return Response.json({ error: 'vendor_id required' }, { status: 400 });

    // Get all active sources for this vendor
    const vendorSources = await base44.entities.PartVendorSource.filter({
      vendor_id,
      is_active: true,
    });

    // Get parts that have this as default vendor (fallback for unseeded parts)
    const partsWithDefaultVendor = await base44.entities.Part.filter({
      default_vendor_id: vendor_id,
      is_archived: { $ne: true },
      is_active: true,
    });

    // Merge part IDs: sources + default vendor parts
    const sourcePartIds = new Set(vendorSources.map(s => s.part_id));
    const defaultPartIds = new Set(partsWithDefaultVendor.map(p => p.id));
    const allCompatiblePartIds = [...new Set([...sourcePartIds, ...defaultPartIds])];

    if (allCompatiblePartIds.length === 0) {
      return Response.json({ success: true, vendor_id, suggestions: [], summary: { total: 0 } });
    }

    // Get open commitments for these parts
    const commitmentFilter = {
      part_id: { $in: allCompatiblePartIds },
      commitment_status: { $nin: ['cancelled', 'closed'] },
    };
    if (project_id) commitmentFilter.project_id = project_id;

    const commitments = await base44.entities.PartCommitment.filter(commitmentFilter);

    // Filter to those with a gap (to_order > 0)
    const withGap = commitments.filter(c => {
      const gap = Math.max(0,
        (c.required_total ?? 0) -
        (c.reserved_from_stock ?? 0) -
        (c.covered_from_po ?? 0) -
        (c.qty_installed ?? 0)
      );
      return gap > 0;
    });

    if (withGap.length === 0) {
      return Response.json({ success: true, vendor_id, suggestions: [], summary: { total: 0 } });
    }

    // Resolve part names and project names
    const gapPartIds = [...new Set(withGap.map(c => c.part_id))];
    const gapProjectIds = [...new Set(withGap.map(c => c.project_id).filter(Boolean))];

    const [parts, projects, allSourcesForParts] = await Promise.all([
      base44.entities.Part.filter({ id: { $in: gapPartIds } }),
      gapProjectIds.length > 0 ? base44.entities.Project.filter({ id: { $in: gapProjectIds } }) : [],
      // Fetch ALL active sources across ALL vendors for these parts (for cross-vendor comparison)
      base44.entities.PartVendorSource.filter({ part_id: { $in: gapPartIds }, is_active: true }),
    ]);
    const partMap = new Map(parts.map(p => [p.id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const sourceMap = new Map(vendorSources.map(s => [s.part_id, s]));

    // Build cross-vendor source map: part_id -> all sources from any vendor
    const allSourcesByPart = new Map();
    for (const s of allSourcesForParts) {
      if (!allSourcesByPart.has(s.part_id)) allSourcesByPart.set(s.part_id, []);
      allSourcesByPart.get(s.part_id).push(s);
    }

    // Resolve vendor names for all sources
    const allVendorIds = [...new Set(allSourcesForParts.map(s => s.vendor_id).filter(Boolean))];
    const allVendors = allVendorIds.length > 0
      ? await base44.entities.Vendor.filter({ id: { $in: allVendorIds } })
      : [];
    const vendorNameMap = new Map(allVendors.map(v => [v.id, v.vendor_name]));

    const suggestions = withGap.map(c => {
      const part = partMap.get(c.part_id);
      const project = projectMap.get(c.project_id);
      const source = sourceMap.get(c.part_id);
      const gap = Math.max(0,
        (c.required_total ?? 0) -
        (c.reserved_from_stock ?? 0) -
        (c.covered_from_po ?? 0) -
        (c.qty_installed ?? 0)
      );

      const thisVendorCost = source?.unit_cost || part?.cost || 0;

      // Cross-vendor comparison: find all sources for this part
      const partSources = allSourcesByPart.get(c.part_id) || [];
      // Include a synthetic source for the part's default vendor cost if not already represented
      const allCosts = partSources.map(s => ({
        source_id: s.id,
        vendor_id: s.vendor_id,
        vendor_name: vendorNameMap.get(s.vendor_id) || 'Unknown',
        vendor_part_number: s.vendor_part_number || null,
        unit_cost: s.unit_cost || 0,
        is_preferred: s.is_preferred || false,
        is_this_vendor: s.vendor_id === vendor_id,
      }));

      // If part has a default vendor cost not covered by any source, add synthetic entry
      if (part?.default_vendor_id && part.cost > 0) {
        const hasDefaultSource = allCosts.some(s => s.vendor_id === part.default_vendor_id);
        if (!hasDefaultSource) {
          allCosts.push({
            source_id: null,
            vendor_id: part.default_vendor_id,
            vendor_name: vendorNameMap.get(part.default_vendor_id) || 'Default',
            vendor_part_number: part.vendor_part_number || null,
            unit_cost: part.cost,
            is_preferred: false,
            is_this_vendor: part.default_vendor_id === vendor_id,
          });
        }
      }

      // Find cheapest across all vendors
      const validCosts = allCosts.filter(s => s.unit_cost > 0);
      const cheapestCost = validCosts.length > 0 ? Math.min(...validCosts.map(s => s.unit_cost)) : 0;
      const is_cheapest_source = thisVendorCost > 0 && thisVendorCost <= cheapestCost;
      const price_delta = cheapestCost > 0 && thisVendorCost > 0 ? thisVendorCost - cheapestCost : 0;

      // Sort: cheapest first, then this vendor's source first among equal costs
      allCosts.sort((a, b) => {
        if (a.unit_cost !== b.unit_cost) return a.unit_cost - b.unit_cost;
        if (a.is_this_vendor !== b.is_this_vendor) return a.is_this_vendor ? -1 : 1;
        return 0;
      });

      return {
        commitment_id: c.id,
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        vendor_part_number: source?.vendor_part_number || part?.vendor_part_number || null,
        project_id: c.project_id,
        project_name: project?.name || 'Unknown',
        qty_to_order: gap,
        unit_cost: thisVendorCost,
        source_id: source?.id || null,
        has_dedicated_source: !!source,
        is_default_vendor: part?.default_vendor_id === vendor_id,
        // Cross-vendor comparison fields
        is_cheapest_source,
        cheapest_cost: cheapestCost,
        price_delta,
        all_sources: allCosts,
        source_count: allCosts.length,
      };
    });

    // Sort: dedicated sources first, then by project, then by part name
    suggestions.sort((a, b) => {
      if (a.has_dedicated_source !== b.has_dedicated_source) return a.has_dedicated_source ? -1 : 1;
      if (a.project_name !== b.project_name) return a.project_name.localeCompare(b.project_name);
      return a.part_name.localeCompare(b.part_name);
    });

    return Response.json({
      success: true,
      vendor_id,
      suggestions,
      summary: {
        total: suggestions.length,
        total_qty: suggestions.reduce((s, x) => s + x.qty_to_order, 0),
        total_estimated_cost: suggestions.reduce((s, x) => s + x.qty_to_order * x.unit_cost, 0),
        with_dedicated_source: suggestions.filter(x => x.has_dedicated_source).length,
        default_vendor_only: suggestions.filter(x => !x.has_dedicated_source).length,
      },
    });
  } catch (error) {
    console.error('getVendorSuggestions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});