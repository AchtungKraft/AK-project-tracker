import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";

export default function CreateInlineModal({ entityType, onClose, onCreate, parentData = {} }) {
  const [formData, setFormData] = useState(() => {
    const base = { 
      active: true, 
      sort_order: 0,
      color: "#3B82F6"
    };
    
    if (entityType === 'CarModel' && parentData.car_make_id) {
      return { ...base, car_make_id: parentData.car_make_id };
    }
    if (entityType === 'CarYear' && parentData.car_model_id) {
      return { ...base, car_model_id: parentData.car_model_id };
    }
    
    return base;
  });
  const [creating, setCreating] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: entityType === 'PartCategory',
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: entityType === 'Location',
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: entityType === 'Vendor',
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: async () => {
      const list = await base44.entities.CarMake.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: entityType === 'CarModel' || entityType === 'CarYear',
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: async () => {
      const list = await base44.entities.CarModel.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: entityType === 'CarYear',
  });

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setCreating(true);
    try {
      await onCreate(entityType, formData);
    } finally {
      setCreating(false);
    }
  };

  const getTitle = () => {
    switch(entityType) {
      case 'PartCategory': return 'Create Part Category';
      case 'Vendor': return 'Create Vendor';
      case 'Location': return 'Create Location';
      case 'CarMake': return 'Create Car Make';
      case 'CarModel': return 'Create Car Model';
      case 'CarYear': return 'Create Car Year/Series';
      default: return 'Create New';
    }
  };

  const renderForm = () => {
    switch(entityType) {
      case 'PartCategory':
        return (
          <>
            <div>
              <Label className="text-gray-400 text-xs">Category Name *</Label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Engine Parts"
                className="bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Parent Category</Label>
              <Select
                value={formData.parent_id || 'none'}
                onValueChange={(value) => setFormData({ ...formData, parent_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent style={{ zIndex: 999999 }}>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {categories.filter(c => c.active && !c.parent_id).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Category description..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
          </>
        );

      case 'Vendor':
        const parentVendors = vendors.filter(v => !v.parent_id && v.active);
        return (
          <>
            <div>
              <Label className="text-gray-400 text-xs">Vendor Name *</Label>
              <Input
                value={formData.vendor_name || ''}
                onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                placeholder="e.g., OEM Parts Supplier"
                className="bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Parent Vendor</Label>
              <Select
                value={formData.parent_id || 'none'}
                onValueChange={(value) => setFormData({ ...formData, parent_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent style={{ zIndex: 999999 }}>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {parentVendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Website</Label>
              <Input
                type="url"
                value={formData.website || ''}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://vendor.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Contact Info</Label>
              <Input
                value={formData.contact_info || ''}
                onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
                placeholder="Phone, email, etc."
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Notes</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </>
        );

      case 'Location':
        const parentLocations = locations.filter(l => !l.parent_id && l.active);
        return (
          <>
            <div>
              <Label className="text-gray-400 text-xs">Location Area *</Label>
              <Input
                value={formData.location_area || ''}
                onChange={(e) => setFormData({ ...formData, location_area: e.target.value })}
                placeholder="e.g., Warehouse A, Shop Floor"
                className="bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Parent Location</Label>
              <Select
                value={formData.parent_id || 'none'}
                onValueChange={(value) => setFormData({ ...formData, parent_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent style={{ zIndex: 999999 }}>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {parentLocations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Storage Type</Label>
              <Input
                value={formData.storage_type || ''}
                onChange={(e) => setFormData({ ...formData, storage_type: e.target.value })}
                placeholder="e.g., Shelf, Bin, Pallet"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Bin/Shelf Description</Label>
              <Input
                value={formData.bin_description || ''}
                onChange={(e) => setFormData({ ...formData, bin_description: e.target.value })}
                placeholder="e.g., A-3-5"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Notes</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Location notes..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </>
        );

      case 'CarMake':
        return (
          <>
            <div>
              <Label className="text-gray-400 text-xs">Car Make *</Label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Porsche"
                className="bg-gray-800 border-gray-700 text-white"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Make description..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
          </>
        );

      case 'CarModel':
        const availableMakes = makes.filter(m => m.active);
        return (
          <>
            <div>
              <Label className="text-gray-400 text-xs">Car Make *</Label>
              <Select
                value={formData.car_make_id || 'none'}
                onValueChange={(value) => setFormData({ ...formData, car_make_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select make..." />
                </SelectTrigger>
                <SelectContent style={{ zIndex: 999999 }}>
                  <SelectItem value="none">Select make...</SelectItem>
                  {availableMakes.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Model Name *</Label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., 911"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Model description..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
          </>
        );

      case 'CarYear':
        const availableModels = models.filter(m => m.active);
        return (
          <>
            <div>
              <Label className="text-gray-400 text-xs">Car Model *</Label>
              <Select
                value={formData.car_model_id || 'none'}
                onValueChange={(value) => setFormData({ ...formData, car_model_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent style={{ zIndex: 999999 }}>
                  <SelectItem value="none">Select model...</SelectItem>
                  {availableModels.map(m => {
                    const make = makes.find(mk => mk.id === m.car_make_id);
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {make?.name} {m.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Year/Series *</Label>
              <Input
                value={formData.year || ''}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                placeholder="e.g., 1989, 1984-1989, 964"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Description</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Year/series description..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Color</Label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const isValid = () => {
    switch(entityType) {
      case 'PartCategory':
        return formData.name?.trim();
      case 'Vendor':
        return formData.vendor_name?.trim();
      case 'Location':
        return formData.location_area?.trim();
      case 'CarMake':
        return formData.name?.trim();
      case 'CarModel':
        return formData.name?.trim() && formData.car_make_id;
      case 'CarYear':
        return formData.year?.trim() && formData.car_model_id;
      default:
        return false;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="bg-gray-900 border border-red-900/30 text-white max-w-md"
        style={{ zIndex: 99999 }}
      >
        <DialogHeader>
          <DialogTitle className="text-white">{getTitle()}</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new item.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {renderForm()}
        </form>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-700 text-white"
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid() || creating}
            className="flex-1 bg-red-600 hover:bg-red-700 gap-2"
          >
            {creating ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>
            ) : (
              <><Plus className="w-4 h-4" />Create</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}