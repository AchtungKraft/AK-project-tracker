import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FolderKanban, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { buildHierarchicalOptions } from "@/components/supply/vendorGroupHierarchy";

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

  // ── Associated Projects (edit mode only) ──
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

  const associatedProjects = useMemo(() => {
    if (projectIds.length === 0) return [];

    const statusMap = new Map(statuses.filter(s => s.scope === "Project").map(s => [s.id, s]));
    const serviceMap = new Map(services.map(s => [s.id, s]));

    return projectIds
      .map(pid => {
        const project = projects.find(p => p.id === pid);
        if (!project) return null;
        const status = statusMap.get(project.status_id);
        const commitments = serviceCommitments.filter(sc => sc.project_id === pid);
        const serviceNames = [...new Set(commitments.map(sc => serviceMap.get(sc.service_id)?.name).filter(Boolean))];
        const latestDate = commitments.reduce((latest, sc) => {
          const d = sc.completed_date || sc.ordered_date || sc.created_date;
          return d && (!latest || d > latest) ? d : latest;
        }, null);
        const isTerminal = status?.label?.toLowerCase().match(/complete|done|closed|archived/);
        return { project, status, serviceNames, commitmentCount: commitments.length, latestDate, isTerminal: !!isTerminal };
      })
      .filter(Boolean)
      .sort((a, b) => {
        // Active first, then by latest date descending
        if (a.isTerminal !== b.isTerminal) return a.isTerminal ? 1 : -1;
        if (a.latestDate && b.latestDate) return b.latestDate.localeCompare(a.latestDate);
        if (a.latestDate) return -1;
        if (b.latestDate) return 1;
        return a.project.name.localeCompare(b.project.name);
      });
  }, [projectIds, projects, statuses, serviceCommitments, services]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (!form.vendor_group_id) { toast.error("Vendor Group required"); return; }
    setSaving(true);
    try {
      const data = {};
      // Only include fields that have values (avoid overwriting with undefined)
      Object.entries(form).forEach(([key, val]) => {
        data[key] = typeof val === "string" ? (val.trim() || null) : val;
      });
      // Ensure name stays trimmed and non-null
      data.name = form.name.trim();

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

          {/* ── Section 3: Associated Projects (edit mode only) ── */}
          {!isNew && (
            <>
              <SectionHeader>Associated Projects</SectionHeader>
              {associatedProjects.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-2">No projects currently reference this service vendor.</p>
              ) : (
                <div className="space-y-1.5">
                  {associatedProjects.map(({ project, status, serviceNames, commitmentCount, isTerminal }) => (
                    <Link
                      key={project.id}
                      to={`/projectdetail?id=${project.id}`}
                      className={cn(
                        "flex items-start gap-2 p-2 rounded-lg transition-colors group",
                        isTerminal ? "bg-gray-800/30 hover:bg-gray-800/50" : "bg-gray-800/60 hover:bg-gray-800/80"
                      )}
                    >
                      <FolderKanban className={cn("w-4 h-4 mt-0.5 shrink-0", isTerminal ? "text-gray-600" : "text-red-400/70")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("text-sm font-medium truncate group-hover:text-red-400 transition-colors", isTerminal ? "text-gray-500" : "text-white")}>
                            {project.name}
                          </span>
                          {status && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                              style={{ borderColor: status.color, color: status.color }}
                            >
                              {status.label}
                            </Badge>
                          )}
                        </div>
                        {project.client_name && (
                          <p className="text-xs text-gray-500">{project.client_name}</p>
                        )}
                        {serviceNames.length > 0 && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            {serviceNames.join(", ")} · {commitmentCount} commitment{commitmentCount !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 mt-0.5" />
                    </Link>
                  ))}
                </div>
              )}
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