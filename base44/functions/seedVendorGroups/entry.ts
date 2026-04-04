import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PART_GROUPS = [
  "OEM / Dealer",
  "Specialist ECommerce",
  "Marketplace",
  "Manufacturer Direct (Aftermarket)",
  "Wholesale",
  "Salvage / Used",
  "ALIBABA",
  "Achtung Kraft Production",
];

const SERVICE_GROUPS = [
  "Finishing",
  "Machining",
  "Engine / Drivetrain Services",
  "Upholstery / Interior",
  "Electrical / Electronics",
  "Restoration Specialists",
  "Cleaning / Media Processing",
  "Automotive Painting",
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const existing = await base44.asServiceRole.entities.VendorGroup.filter({});
    const existingNames = new Set(existing.map(g => `${g.vendor_type}:${g.name}`));

    const toCreate = [];

    PART_GROUPS.forEach((name, idx) => {
      const key = `PART:${name}`;
      if (!existingNames.has(key)) {
        toCreate.push({ name, vendor_type: "PART", sort_priority: idx + 1, is_active: true });
      }
    });

    SERVICE_GROUPS.forEach((name, idx) => {
      const key = `SERVICE:${name}`;
      if (!existingNames.has(key)) {
        toCreate.push({ name, vendor_type: "SERVICE", sort_priority: idx + 1, is_active: true });
      }
    });

    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.VendorGroup.bulkCreate(toCreate);
    }

    return Response.json({
      created: toCreate.length,
      skipped: (PART_GROUPS.length + SERVICE_GROUPS.length) - toCreate.length,
      total_existing: existing.length,
      groups_created: toCreate.map(g => `${g.vendor_type}: ${g.name}`),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});