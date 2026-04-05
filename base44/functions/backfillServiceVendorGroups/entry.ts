import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Backfill vendor_group_id on ServiceVendor records
 * and preferred_vendor_group_id on Service records
 * by matching their category strings to VendorGroup names.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  // Fetch all data
  const [vendorGroups, serviceVendors, services] = await Promise.all([
    base44.asServiceRole.entities.VendorGroup.filter({ vendor_type: "SERVICE", is_active: true }),
    base44.asServiceRole.entities.ServiceVendor.filter({}),
    base44.asServiceRole.entities.Service.filter({}),
  ]);

  // Build category → group mapping (fuzzy)
  // VendorGroup names: Finishing, Machining/Lasercutting, Engine/Drivetrain, Upholstery/Interior,
  //                    Electrical/Electronics, Restoration Specialists, Cleaning/Media, Automotive Painting, UNCATEGORIZED
  const categoryToGroup = {};
  for (const g of vendorGroups) {
    const gLower = g.name.toLowerCase();
    // Map specific service categories to vendor groups
    if (gLower.includes('finishing')) {
      categoryToGroup['finishing'] = g.id;
      categoryToGroup['plating'] = g.id;
      categoryToGroup['coating'] = g.id;
    }
    if (gLower.includes('machining') || gLower.includes('lasercutting')) {
      categoryToGroup['machine_work'] = g.id;
      categoryToGroup['fabrication'] = g.id;
    }
    if (gLower.includes('upholstery') || gLower.includes('interior')) {
      categoryToGroup['upholstery'] = g.id;
    }
    if (gLower.includes('electrical') || gLower.includes('electronics')) {
      categoryToGroup['electrical'] = g.id;
    }
    if (gLower.includes('paint')) {
      categoryToGroup['paint'] = g.id;
    }
    if (gLower.includes('cleaning') || gLower.includes('media')) {
      categoryToGroup['inspection'] = g.id;
    }
    if (gLower === 'uncategorized') {
      categoryToGroup['general'] = g.id;
      categoryToGroup['other'] = g.id;
      categoryToGroup['shipping'] = g.id; // shipping has no dedicated group, goes to uncategorized
    }
  }

  // Check for a Shipping group — if not found, create one
  let shippingGroup = vendorGroups.find(g => g.name.toLowerCase().includes('shipping'));
  if (!shippingGroup) {
    shippingGroup = await base44.asServiceRole.entities.VendorGroup.create({
      name: "Shipping / Logistics",
      vendor_type: "SERVICE",
      sort_priority: 0,
      is_active: true,
    });
    console.log("Created Shipping group:", shippingGroup.id);
  }
  categoryToGroup['shipping'] = shippingGroup.id;

  console.log("Category → Group mapping:", JSON.stringify(categoryToGroup));

  // Backfill ServiceVendor.vendor_group_id
  const vendorResults = [];
  for (const v of serviceVendors) {
    if (v.vendor_group_id) {
      vendorResults.push({ id: v.id, name: v.name, status: "already_set", group: v.vendor_group_id });
      continue;
    }
    const cat = v.category || "general";
    const groupId = categoryToGroup[cat];
    if (groupId) {
      await base44.asServiceRole.entities.ServiceVendor.update(v.id, { vendor_group_id: groupId });
      vendorResults.push({ id: v.id, name: v.name, status: "updated", category: cat, group: groupId });
    } else {
      vendorResults.push({ id: v.id, name: v.name, status: "no_match", category: cat });
    }
  }

  // Backfill Service.preferred_vendor_group_id
  const serviceResults = [];
  for (const s of services) {
    if (s.preferred_vendor_group_id) {
      serviceResults.push({ id: s.id, name: s.name, status: "already_set" });
      continue;
    }
    const cat = s.category || "other";
    const groupId = categoryToGroup[cat];
    if (groupId) {
      await base44.asServiceRole.entities.Service.update(s.id, { preferred_vendor_group_id: groupId });
      serviceResults.push({ id: s.id, name: s.name, status: "updated", category: cat, group: groupId });
    } else {
      serviceResults.push({ id: s.id, name: s.name, status: "no_match", category: cat });
    }
  }

  return Response.json({
    vendorGroupCount: vendorGroups.length,
    categoryMapping: categoryToGroup,
    vendors: vendorResults,
    services: serviceResults,
  });
});