import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { buildHierarchicalOptions } from "@/components/supply/vendorGroupHierarchy";
import VendorUsageSummary from "./VendorUsageSummary";
import VendorProjectList from "./VendorProjectList";

const EMPTY_FORM = {
  name: "",
  vendor_group_id: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  cell_phone: "",
  address: "",
  website: "",
  notes: "",
  service_capabilities: "",
  preferred_use_cases: "",
  vendor_instructions: "",
  pricing_notes: "",
  scheduling_notes: "",
  internal_warnings: "",
  insurance_compliance_notes: "",
};

function SectionHeader({ children }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mt-4 mb-2 first:mt-0">{children}</h3>
  );
}

function DetailTextarea({ label, value, onChange, placeholder, rows = 2 }) {
  return (
    <div>
      <Label className="text-gray-300 text-xs">{label}</Label>
      <Textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="bg-gray-800 border-gray-600 text-white mt-1 text-sm"
        rows={rows}
      />
    </div>
  );
}

export default function ServiceVendorDetailModal({ vendor, vendorGroups, onClose, onSuccess }) {
  const isNew = !vendor;
  const [form, setForm] = useState(isNew ? { ...EMPTY_FORM } : {
    name: vendor.name || "",
    vendor_group_id: vendor.vendor_group_id || "",
    contact_name: vendor.contact_name || "",
    contact_email: vendor.contact_email || "",
    contact_phone: vendor.contact_phone || "",
    cell_phone: vendor.cell_phone || "",
    address: vendor.address || "",
    website: vendor.website || "",
    notes: vendor.notes || "",
    service_capabilities: vendor.service_capabilities || "",
    preferred_use_cases: vendor.preferred_use_cases || "",
    vendor_instructions: vendor.vendor_instructions || "",
    pricing_notes: vendor.pricing_notes || "",
    scheduling_notes: vendor.scheduling_notes || "",
    internal_warnings: vendor.internal_warnings || "",
    insurance_compliance_notes: vendor.insurance_compliance_notes || "",
  });
  const [saving, setSaving] = useState(false);

  const hierarchicalOptions = useMemo(
    () => buildHierarchicalOptions(vendorGroups, "SERVICE"),
    [vendorGroups]
  );

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // ── Associated Projects data (edit mode only) ──
  const { data: serviceCommitments = [] } = useQuery({
    queryKey: ["serviceCommitments-vendor", vendor?.id],
    queryFn: () => base44.entities.ServiceCommitment.filter({ vendor_id: vendor.id }),
    enabled: !!vendor?.id,
  });

  const projectIds = useMemo(() => {
    return [...new Set(serviceCommitments.map(sc => sc.project_id).filter(Boolean))];
  }, [serviceCommitments]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    enabled: projectIds.length > 0,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["statuses"],
    queryFn: () => base44.entities.StatusList.list(),
    enabled: projectIds.length > 0,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: () => base44.entities.Service.list(),
    enabled: projectIds.length > 0,
  });

  // Lookup maps for usage summary + project list
  const statusMap = useMemo(() => {
    return new Map(statuses.filter(s => s.scope === "Project").map(s => [s.id, s]));
  }, [statuses]);

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s])), [services]);

  const associatedProjects = useMemo(() => {
    if (projectIds.length === 0) return [];

    return projectIds
      .map(pid => {
        const project = projectMap.get(pid);
        if (!project) return null;
        const status = statusMap.get(project.status_id);
        const commitments = serviceCommitments.filter(sc => sc.project_id === pid);
        const serviceNames = [...new Set(commitments.map(sc => serviceMap.get(sc.service_id)?.name).filter(Boolean))];
        const latestDate = commitments.reduce((latest, sc) => {
          const d = sc.completed_date || sc.ordered_date || sc.created_date;
          return d && (!latest || d > latest) ? d : latest;
        }, null);
        const isTerminal = !!status?.label?.toLowerCase().match(/complete|done|closed|archived/);
        return { project, status, serviceNames, commitmentCount: commitments.length, latestDate, isTerminal };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.isTerminal !== b.isTerminal) return a.isTerminal ? 1 : -1;
        if (a.latestDate && b.latestDate) return b.latestDate.localeCompare(a.latestDate);
        if (a.latestDate) return -1;
        if (b.latestDate) return 1;
        return a.project.name.localeCompare(b.project.name);
      });
  }, [projectIds, projectMap, statusMap, serviceCommitments, serviceMap]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (!form.vendor_group_id) { toast.error("Vendor Group required"); return; }
    setSaving(true);
    try {
      const data = {};
      Object.entries(form).forEach(([key, val]) => {
        data[key] = typeof val === "string" ? (val.trim() || null) : val;
      });
      data.name = form.name.trim();

      // Audit metadata
      const user = await base44.auth.me();
      data.last_updated_at = new Date().toISOString();
      data.last_updated_by = user?.full_name || user?.email || "Unknown";

      if (isNew) {
        await base44.entities.ServiceVendor.create({ ...data, is_active: true });
        toast.success(`Vendor "${data.name}" created`);
      } else {
        await base44.entities.ServiceVendor.update(vendor.id, data);
        toast.success(`Vendor "${data.name}" updated`);
      }
      onSuccess();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white">{isNew ? "Add Service Vendor" : "Edit Service Vendor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 overflow-y-auto flex-1 pr-1">
          {/* ── Section 1: Primary Info ── */}
          <SectionHeader>Primary Contact Info</SectionHeader>
          <div>
            <Label className="text-gray-300 text-xs">Vendor Name *</Label>
            <Input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="e.g., Chrome Plating Co." className="bg-gray-800 border-gray-600 text-white mt-1" autoFocus />
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Vendor Group *</Label>
            <Select value={form.vendor_group_id} onValueChange={v => updateField("vendor_group_id", v)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select group..." />
              </SelectTrigger>
              <SelectContent>
                {hierarchicalOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.depth > 0 ? `${"  ".repeat(opt.depth)}↳ ${opt.name}` : opt.name}
                    {opt.depth > 0 ? ` (${opt.label})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 text-xs">Contact Name</Label>
              <Input value={form.contact_name} onChange={e => updateField("contact_name", e.target.value)} placeholder="Primary contact" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Contact Email</Label>
              <Input type="email" value={form.contact_email} onChange={e => updateField("contact_email", e.target.value)} placeholder="email@vendor.com" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Contact Phone</Label>
              <Input value={form.contact_phone} onChange={e => updateField("contact_phone", e.target.value)} placeholder="(555) 123-4567" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Cell Phone</Label>
              <Input value={form.cell_phone} onChange={e => updateField("cell_phone", e.target.value)} placeholder="(555) 987-6543" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Address</Label>
            <Input value={form.address} onChange={e => updateField("address", e.target.value)} placeholder="Vendor address" className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Website</Label>
            <Input value={form.website} onChange={e => updateField("website", e.target.value)} placeholder="https://vendor.com" className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>

          {/* ── Section 2: Vendor Details ── */}
          <SectionHeader>Vendor Details</SectionHeader>
          <DetailTextarea
            label="Service Capabilities"
            value={form.service_capabilities}
            onChange={e => updateField("service_capabilities", e.target.value)}
            placeholder="What services can this vendor provide?"
          />
          <DetailTextarea
            label="Preferred Use Cases"
            value={form.preferred_use_cases}
            onChange={e => updateField("preferred_use_cases", e.target.value)}
            placeholder="When to use this vendor over alternatives..."
          />
          <DetailTextarea
            label="Scheduling Notes"
            value={form.scheduling_notes}
            onChange={e => updateField("scheduling_notes", e.target.value)}
            placeholder="Lead times, availability, scheduling considerations..."
          />
          <DetailTextarea
            label="Pricing Notes"
            value={form.pricing_notes}
            onChange={e => updateField("pricing_notes", e.target.value)}
            placeholder="Pricing structure, minimums, payment terms..."
          />
          <DetailTextarea
            label="Vendor Instructions"
            value={form.vendor_instructions}
            onChange={e => updateField("vendor_instructions", e.target.value)}
            placeholder="How to order, delivery instructions, special handling..."
          />
          <DetailTextarea
            label="Internal Warnings / Cautions"
            value={form.internal_warnings}
            onChange={e => updateField("internal_warnings", e.target.value)}
            placeholder="Known issues, reliability concerns..."
          />
          <DetailTextarea
            label="Insurance / Compliance"
            value={form.insurance_compliance_notes}
            onChange={e => updateField("insurance_compliance_notes", e.target.value)}
            placeholder="Insurance coverage, certifications, compliance notes..."
          />
          <DetailTextarea
            label="General Notes"
            value={form.notes}
            onChange={e => updateField("notes", e.target.value)}
            placeholder="Additional notes..."
          />

          {/* ── Audit metadata ── */}
          {!isNew && (vendor.last_updated_at || vendor.updated_date) && (
            <div className="flex items-center gap-2 text-[11px] text-gray-600 mt-1">
              <Clock className="w-3 h-3" />
              <span>
                Last updated: {new Date(vendor.last_updated_at || vendor.updated_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {vendor.last_updated_by && ` by ${vendor.last_updated_by}`}
              </span>
            </div>
          )}

          {/* ── Section 3: Usage Analytics + Associated Projects (edit mode) ── */}
          {!isNew && (
            <>
              {serviceCommitments.length > 0 && (
                <>
                  <SectionHeader>Vendor Usage</SectionHeader>
                  <VendorUsageSummary
                    commitments={serviceCommitments}
                    projectMap={projectMap}
                    statusMap={statusMap}
                  />
                </>
              )}

              <SectionHeader>Associated Projects</SectionHeader>
              <VendorProjectList associatedProjects={associatedProjects} />
            </>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-gray-800">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.vendor_group_id}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {saving ? "Saving..." : isNew ? "Create Vendor" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}