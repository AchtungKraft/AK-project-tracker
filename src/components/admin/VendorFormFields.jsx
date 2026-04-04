import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Truck } from "lucide-react";

/**
 * Shared vendor form fields used by both Create and Edit Vendor.
 * Enforces canonical vendor_type + vendor_group_id structure.
 * 
 * Props:
 *   data       — current form data object
 *   onChange   — (updated) => void
 *   groups     — all VendorGroup records
 *   showType   — whether to show the vendor_type selector (true for edit, false for create when type comes from tab)
 */
export default function VendorFormFields({ data, onChange, groups, showType = false }) {
  const vendorType = data.vendor_type || "PART";

  const groupsForType = groups
    .filter(g => g.vendor_type === vendorType && g.is_active !== false && g.name !== "UNCATEGORIZED")
    .sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));

  const handleTypeChange = (newType) => {
    // Clear group when type changes since groups are type-scoped
    onChange({ ...data, vendor_type: newType, vendor_group_id: "" });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {showType && (
        <div>
          <Label className="text-gray-400 text-xs">Vendor Type *</Label>
          <Select value={vendorType} onValueChange={handleTypeChange}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PART">
                <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />Part Vendor</span>
              </SelectItem>
              <SelectItem value="SERVICE">
                <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />Service Vendor</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label className="text-gray-400 text-xs">Vendor Name *</Label>
        <Input
          value={data.vendor_name || ""}
          onChange={(e) => onChange({ ...data, vendor_name: e.target.value })}
          placeholder={vendorType === "PART" ? "e.g., OEM Parts Supplier" : "e.g., Chrome Plating Co."}
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Vendor Group *</Label>
        <Select
          value={data.vendor_group_id || "none"}
          onValueChange={(value) => onChange({ ...data, vendor_group_id: value === "none" ? "" : value })}
        >
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
            <SelectValue placeholder="Select group..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select group...</SelectItem>
            {groupsForType.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Contact Name</Label>
        <Input
          value={data.contact_name || ""}
          onChange={(e) => onChange({ ...data, contact_name: e.target.value })}
          placeholder="Primary contact"
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Contact Email</Label>
        <Input
          value={data.contact_email || ""}
          onChange={(e) => onChange({ ...data, contact_email: e.target.value })}
          placeholder="email@vendor.com"
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Contact Phone</Label>
        <Input
          value={data.contact_phone || ""}
          onChange={(e) => onChange({ ...data, contact_phone: e.target.value })}
          placeholder="(555) 123-4567"
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Cell Phone</Label>
        <Input
          value={data.cell_phone || ""}
          onChange={(e) => onChange({ ...data, cell_phone: e.target.value })}
          placeholder="(555) 987-6543"
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Website</Label>
        <Input
          type="url"
          value={data.website || ""}
          onChange={(e) => onChange({ ...data, website: e.target.value })}
          placeholder="https://vendor.com"
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Address</Label>
        <Input
          value={data.address || ""}
          onChange={(e) => onChange({ ...data, address: e.target.value })}
          placeholder="Vendor address"
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Color</Label>
        <input
          type="color"
          value={data.color || "#3B82F6"}
          onChange={(e) => onChange({ ...data, color: e.target.value })}
          className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
        />
      </div>

      <div>
        <Label className="text-gray-400 text-xs">Sort Order</Label>
        <Input
          type="number"
          value={data.sort_order ?? 0}
          onChange={(e) => onChange({ ...data, sort_order: parseInt(e.target.value) || 0 })}
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>

      <div className="md:col-span-2">
        <Label className="text-gray-400 text-xs">Notes</Label>
        <Textarea
          value={data.notes || ""}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          placeholder="Additional vendor notes..."
          className="bg-gray-800 border-gray-700 text-white"
          rows={2}
        />
      </div>
    </div>
  );
}