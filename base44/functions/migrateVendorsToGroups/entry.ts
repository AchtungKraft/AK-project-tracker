import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * migrateVendorsToGroups — Assigns vendor_type + vendor_group_id to all untyped vendors.
 * Uses name-based heuristics to classify into groups.
 * Creates UNCATEGORIZED groups as fallback for unresolvable vendors.
 */

// Name heuristics → group name mappings (PART)
const PART_HEURISTICS = [
  { patterns: [/oem/i, /dealer/i, /porsche/i, /bmw/i, /mercedes/i, /audi/i, /vw /i, /volkswagen/i], group: "OEM / Dealer" },
  { patterns: [/fcpeuro/i, /pelican/i, /ecs tuning/i, /turner/i, /bimmerworld/i, /rennline/i, /cargraphic/i, /suncoast/i, /design911/i, /stoddard/i, /paragon/i], group: "Specialist ECommerce" },
  { patterns: [/amazon/i, /ebay/i, /marketplace/i], group: "Marketplace" },
  { patterns: [/alibaba/i, /aliexpress/i], group: "ALIBABA" },
  { patterns: [/bilstein/i, /bosch/i, /sachs/i, /brembo/i, /mann/i, /mahle/i, /hella/i, /continental/i, /victor reinz/i, /elring/i, /manufacturer/i, /aftermarket/i, /napa/i], group: "Manufacturer Direct (Aftermarket)" },
  { patterns: [/wholesale/i, /bulk/i, /distributor/i], group: "Wholesale" },
  { patterns: [/salvage/i, /used/i, /junk/i, /wreck/i, /pull.*part/i], group: "Salvage / Used" },
  { patterns: [/achtung/i, /ak prod/i, /in.?house/i, /internal/i], group: "Achtung Kraft Production" },
];

// Name heuristics → group name mappings (SERVICE)
const SERVICE_HEURISTICS = [
  { patterns: [/finish/i, /polish/i, /anodiz/i, /powder.?coat/i], group: "Finishing" },
  { patterns: [/chrome/i, /plat/i, /nickel/i, /zinc/i, /cadmium/i], group: "Finishing" },
  { patterns: [/machin/i, /cnc/i, /lathe/i, /mill/i], group: "Machining" },
  { patterns: [/engine/i, /drivetrain/i, /transmiss/i, /rebuild/i], group: "Engine / Drivetrain Services" },
  { patterns: [/upholster/i, /interior/i, /leather/i, /fabric/i, /trim/i], group: "Upholstery / Interior" },
  { patterns: [/electr/i, /wir/i, /harness/i], group: "Electrical / Electronics" },
  { patterns: [/restor/i], group: "Restoration Specialists" },
  { patterns: [/clean/i, /blast/i, /media/i, /soda/i, /strip/i, /vapor/i], group: "Cleaning / Media Processing" },
  { patterns: [/paint/i, /body/i, /spray/i, /collision/i], group: "Automotive Painting" },
  { patterns: [/ship/i, /freight/i, /ups/i, /fedex/i, /dhl/i, /usps/i, /transport/i, /deliver/i], group: "Finishing" },
];

function classifyVendor(vendor, groupsByName) {
  const name = (vendor.vendor_name || '').toLowerCase();
  const notes = (vendor.notes || '').toLowerCase();
  const combined = `${name} ${notes}`;

  // Try PART heuristics first
  for (const rule of PART_HEURISTICS) {
    if (rule.patterns.some(p => p.test(combined))) {
      const group = groupsByName[`PART:${rule.group}`];
      if (group) return { vendor_type: 'PART', vendor_group_id: group.id, matched_group: rule.group };
    }
  }

  // Try SERVICE heuristics
  for (const rule of SERVICE_HEURISTICS) {
    if (rule.patterns.some(p => p.test(combined))) {
      const group = groupsByName[`SERVICE:${rule.group}`];
      if (group) return { vendor_type: 'SERVICE', vendor_group_id: group.id, matched_group: rule.group };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default to dry run

    // Fetch all data
    const [allVendors, allGroups] = await Promise.all([
      base44.asServiceRole.entities.Vendor.filter({}),
      base44.asServiceRole.entities.VendorGroup.filter({}),
    ]);

    // Build group lookup: "TYPE:Name" → group
    const groupsByName = {};
    for (const g of allGroups) {
      groupsByName[`${g.vendor_type}:${g.name}`] = g;
    }

    // Ensure UNCATEGORIZED groups exist
    let uncatPart = groupsByName['PART:UNCATEGORIZED'];
    let uncatService = groupsByName['SERVICE:UNCATEGORIZED'];

    if (!uncatPart && !dryRun) {
      uncatPart = await base44.asServiceRole.entities.VendorGroup.create({
        name: 'UNCATEGORIZED', vendor_type: 'PART', sort_priority: 998, is_active: true,
      });
      groupsByName['PART:UNCATEGORIZED'] = uncatPart;
    }
    if (!uncatService && !dryRun) {
      uncatService = await base44.asServiceRole.entities.VendorGroup.create({
        name: 'UNCATEGORIZED', vendor_type: 'SERVICE', sort_priority: 998, is_active: true,
      });
      groupsByName['SERVICE:UNCATEGORIZED'] = uncatService;
    }

    // Process vendors
    const results = { classified: [], unresolved: [], already_typed: 0, updated: 0, errors: [] };

    for (const vendor of allVendors) {
      // Skip already-typed vendors
      if (vendor.vendor_type && vendor.vendor_group_id) {
        results.already_typed++;
        continue;
      }

      // Try heuristic classification
      const classification = classifyVendor(vendor, groupsByName);

      if (classification) {
        results.classified.push({
          id: vendor.id,
          name: vendor.vendor_name,
          assigned_type: classification.vendor_type,
          assigned_group: classification.matched_group,
        });

        if (!dryRun) {
          await base44.asServiceRole.entities.Vendor.update(vendor.id, {
            vendor_type: classification.vendor_type,
            vendor_group_id: classification.vendor_group_id,
          });
          results.updated++;
        }
      } else {
        // Fallback: default to PART + UNCATEGORIZED
        const fallbackType = 'PART';
        const fallbackGroup = groupsByName[`${fallbackType}:UNCATEGORIZED`];

        results.unresolved.push({
          id: vendor.id,
          name: vendor.vendor_name,
          fallback_type: fallbackType,
          fallback_group: 'UNCATEGORIZED',
        });

        if (!dryRun && fallbackGroup) {
          await base44.asServiceRole.entities.Vendor.update(vendor.id, {
            vendor_type: fallbackType,
            vendor_group_id: fallbackGroup.id,
          });
          results.updated++;
        }
      }
    }

    return Response.json({
      dry_run: dryRun,
      total_vendors: allVendors.length,
      already_typed: results.already_typed,
      classified: results.classified.length,
      unresolved: results.unresolved.length,
      updated: results.updated,
      classified_vendors: results.classified,
      unresolved_vendors: results.unresolved,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});