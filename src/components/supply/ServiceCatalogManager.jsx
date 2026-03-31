import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "shipping", "finishing", "coating", "plating", "fabrication",
  "upholstery", "electrical", "paint", "machine_work", "inspection", "other"
];

export default function ServiceCatalogManager() {
  const queryClient = useQueryClient();
  const [editModal, setEditModal] = useState(null); // null | "new" | service object
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: () => base44.entities.Vendor.filter({ active: true }),
  });

  const vendorsMap = new Map(vendors.map(v => [v.id, v]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services-catalog"] });

  const handleDelete = async (id) => {
    try {
      await base44.entities.Service.delete(id);
      toast.success("Service deleted");
      invalidate();
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Service Catalog</h2>
          <p className="text-xs text-gray-500">Define reusable service types for project assignment</p>
        </div>
        <Button onClick={() => setEditModal("new")} size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> New Service
        </Button>
      </div>

      {services.length === 0 ? (
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-8 text-center">
            <Truck className="w-10 h-10 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 text-sm">No services in catalog</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {services.map(s => (
            <Card key={s.id} className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400">
                        {s.category || "other"}
                      </Badge>
                      {!s.is_active && (
                        <Badge variant="outline" className="text-[10px] border-red-600 text-red-400">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {s.default_vendor_id && (
                      <p className="text-xs text-gray-500 mt-1">
                        Default: {vendorsMap.get(s.default_vendor_id)?.vendor_name || "Unknown"}
                      </p>
                    )}
                    {s.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditModal(s)}>
                      <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirm(s)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      {editModal && (
        <ServiceEditModal
          service={editModal === "new" ? null : editModal}
          vendors={vendors}
          onClose={() => setEditModal(null)}
          onSuccess={() => { invalidate(); setEditModal(null); }}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Dialog open onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-white">Delete Service?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-400">
              Are you sure you want to delete "{deleteConfirm.name}"? Existing commitments using this service will not be affected.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-gray-600">Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteConfirm.id)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ServiceEditModal({ service, vendors, onClose, onSuccess }) {
  const isNew = !service;
  const [name, setName] = useState(service?.name || "");
  const [category, setCategory] = useState(service?.category || "other");
  const [description, setDescription] = useState(service?.description || "");
  const [defaultVendorId, setDefaultVendorId] = useState(service?.default_vendor_id || "");
  const [isActive, setIsActive] = useState(service?.is_active !== false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        default_vendor_id: defaultVendorId || null,
        is_active: isActive,
      };
      if (isNew) {
        await base44.entities.Service.create(data);
        toast.success("Service created");
      } else {
        await base44.entities.Service.update(service.id, data);
        toast.success("Service updated");
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
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{isNew ? "New Service" : "Edit Service"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-gray-300">Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Default Vendor</Label>
            <Select value={defaultVendorId} onValueChange={setDefaultVendorId}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>None</SelectItem>
                {vendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional..." className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
            <Label className="text-gray-300">Active</Label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : isNew ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}