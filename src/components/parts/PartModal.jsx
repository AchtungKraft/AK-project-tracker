import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Loader2, Edit2, Trash2, X, Upload, Star, ChevronDown, ChevronRight, 
  Camera, ExternalLink, Package, Plus, Wrench, MapPin
} from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import CreateInlineModal from "../common/CreateInlineModal";
import PartPricingFields from "./PartPricingFields";
import PartJournalSection from "./PartJournalSection";
import PartProjectUsageSection from "./PartProjectUsageSection";
import AddInventoryModal from "../inventory/AddInventoryModal";
import AddToBuildModal from "./AddToBuildModal";
import { invalidateSupplyQueries } from "@/components/supply/supplyInvalidation";

export default function PartModal({ part, partId, onClose }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(null);
  const [mediaSectionOpen, setMediaSectionOpen] = useState(true);
  const [journalSectionOpen, setJournalSectionOpen] = useState(true);
  
  // Action modals
  const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
  const [showAddToBuildModal, setShowAddToBuildModal] = useState(false);
  
  // Fetch part if only partId provided
  const { data: fetchedPart, isLoading: partLoading } = useQuery({
    queryKey: ['part', partId],
    queryFn: async () => {
      const parts = await base44.entities.Part.filter({ id: partId });
      return parts[0];
    },
    enabled: !!partId && !part,
  });

  const activePart = part || fetchedPart;

  const [formData, setFormData] = useState(null);

  // Initialize formData when part is loaded
  useEffect(() => {
    if (activePart) {
      setFormData({
        ...activePart,
        photos: activePart.photos || [],
        featured_photo: activePart.featured_photo || '',
        order_url: activePart.order_url || '',
      });
      setEditing(false);
    }
  }, [activePart?.id]);

  // Fetch reference data
  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: async () => {
      const list = await base44.entities.CarMake.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: async () => {
      const list = await base44.entities.CarModel.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: years = [] } = useQuery({
    queryKey: ['carYears'],
    queryFn: async () => {
      const list = await base44.entities.CarYear.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  // Fetch inventory view data for canonical inventory metrics
  const { data: partsInventoryView = [] } = useQuery({
    queryKey: ['partsInventoryView'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPartsInventoryView', {});
      return res.data?.parts || [];
    },
  });

  // Fetch inventory items for location summary
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems', activePart?.id],
    queryFn: () => base44.entities.InventoryItem.filter({ part_id: activePart?.id }),
    enabled: !!activePart?.id,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.update(activePart.id, data),
    onSuccess: () => {
      // Full supply invalidation for consistency
      invalidateSupplyQueries(queryClient, { 
        part_ids: [activePart.id],
        full_invalidate: true 
      });
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['part', activePart.id] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] });
      queryClient.invalidateQueries({ queryKey: ['opsSupplyView'] });
      queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] });
      toast.success('Part updated');
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Part.delete(activePart.id),
    onSuccess: () => {
      invalidateSupplyQueries(queryClient, { full_invalidate: true });
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] });
      toast.success('Part deleted');
      onClose();
    },
  });

  // Get canonical inventory metrics from read model
  const inventoryView = partsInventoryView.find(p => p.part_id === activePart?.id);
  const inventoryMetrics = {
    physical_stock: inventoryView?.physical_stock ?? activePart?.physical_stock ?? 0,
    reserved_global: inventoryView?.allocated_total ?? activePart?.allocated_stock ?? 0,
    on_order: inventoryView?.on_order ?? activePart?.on_order ?? 0,
    available_to_allocate: Math.max(0, (inventoryView?.physical_stock ?? activePart?.physical_stock ?? 0) - (inventoryView?.allocated_total ?? activePart?.allocated_stock ?? 0)),
  };

  // Build location summary from inventory items
  const locationSummary = inventoryItems.reduce((acc, item) => {
    const locId = item.location_id || 'unassigned';
    if (!acc[locId]) acc[locId] = { qty: 0, reserved: 0 };
    acc[locId].qty += item.quantity_on_hand || 0;
    acc[locId].reserved += item.quantity_reserved || 0;
    return acc;
  }, {});

  // Photo handlers
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(file => 
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const newPhotoUrls = results.map(r => r.file_url);
      
      const updatedPhotos = [...(formData.photos || []), ...newPhotoUrls];
      const newFeatured = formData.featured_photo || (updatedPhotos.length > 0 ? updatedPhotos[0] : '');
      setFormData({ ...formData, photos: updatedPhotos, featured_photo: newFeatured });
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (url) => {
    const updatedPhotos = formData.photos.filter(p => p !== url);
    const newFeatured = formData.featured_photo === url ? '' : formData.featured_photo;
    setFormData({ ...formData, photos: updatedPhotos, featured_photo: newFeatured });
  };

  const handleSetFeatured = (url) => {
    setFormData({ ...formData, featured_photo: url });
  };

  const handlePhotoDragEnd = (result) => {
    if (!result.destination) return;
    const photos = Array.from(formData.photos);
    const [removed] = photos.splice(result.source.index, 1);
    photos.splice(result.destination.index, 0, removed);
    setFormData({ ...formData, photos });
  };

  // Inline creation handler
  const handleInlineCreate = async (entityType, data) => {
    let mutation;
    let queryKey;
    
    switch(entityType) {
      case 'PartCategory':
        mutation = base44.entities.PartCategory.create;
        queryKey = 'partCategories';
        break;
      case 'Vendor':
        mutation = base44.entities.Vendor.create;
        queryKey = 'vendors';
        break;
      case 'Location':
        mutation = base44.entities.Location.create;
        queryKey = 'locations';
        break;
      case 'CarMake':
        mutation = base44.entities.CarMake.create;
        queryKey = 'carMakes';
        break;
      case 'CarModel':
        mutation = base44.entities.CarModel.create;
        queryKey = 'carModels';
        break;
      case 'CarYear':
        mutation = base44.entities.CarYear.create;
        queryKey = 'carYears';
        break;
      default:
        return;
    }
    
    try {
      const newItem = await mutation(data);
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
      
      if (entityType === 'PartCategory') setFormData({ ...formData, part_category_id: newItem.id });
      else if (entityType === 'Vendor') setFormData({ ...formData, default_vendor_id: newItem.id });
      else if (entityType === 'Location') setFormData({ ...formData, location_id: newItem.id });
      else if (entityType === 'CarMake') setFormData({ ...formData, car_make_id: newItem.id });
      else if (entityType === 'CarModel') setFormData({ ...formData, car_model_id: newItem.id });
      else if (entityType === 'CarYear') setFormData({ ...formData, car_year_id: newItem.id });
      
      toast.success(`${entityType} created`);
      setShowCreateModal(null);
    } catch (error) {
      toast.error(`Failed to create ${entityType}`);
    }
  };

  const handleSave = (e) => {
    e?.preventDefault();
    if (!formData.part_name?.trim()) {
      toast.error('Part name is required');
      return;
    }
    updateMutation.mutate(formData);
  };

  // Loading state
  if ((partId && !part && partLoading) || !formData) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-red-900/30">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!activePart) return null;

  // Derived data
  const category = categories.find(c => c.id === formData.part_category_id);
  const vendor = vendors.find(v => v.id === formData.default_vendor_id);
  const location = locations.find(l => l.id === formData.location_id);
  const make = makes.find(m => m.id === formData.car_make_id);
  const model = models.find(m => m.id === formData.car_model_id);
  const year = years.find(y => y.id === formData.car_year_id);
  const availableModels = models.filter(m => m.car_make_id === formData.car_make_id);
  const availableYears = years.filter(y => y.car_model_id === formData.car_model_id);

  const activeCategories = categories.filter(c => c.active);
  const activeVendors = vendors.filter(v => v.active);
  const activeLocations = locations.filter(l => l.active);

  // --- VIEW MODE ---
  const renderViewMode = () => (
    <div className="space-y-6 p-4 overflow-y-auto max-h-[70vh]">
      {/* Photos Gallery */}
      {formData.photos && formData.photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {formData.photos.slice(0, 4).map((url, idx) => (
            <div 
              key={idx} 
              className={`aspect-square bg-gray-800 rounded border overflow-hidden ${
                formData.featured_photo === url ? 'border-yellow-500 border-2' : 'border-gray-700'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        {formData.vendor_part_number && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Vendor Part #</p>
            <p className="text-white font-mono">{formData.vendor_part_number}</p>
          </div>
        )}
        {category && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Category</p>
            <Badge style={{ backgroundColor: category.color || '#3B82F6' }} className="text-white">
              {category.name}
            </Badge>
          </div>
        )}
      </div>

      {/* Car Info */}
      {(make || model || year) && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Vehicle</p>
          <p className="text-white">
            {[year?.year, make?.name, model?.name].filter(Boolean).join(' ')}
          </p>
        </div>
      )}

      {/* Pricing Summary (View Only) */}
      <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Cost</p>
            <p className="text-white font-semibold">${formData.cost || 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Retail</p>
            <p className="text-white font-semibold">
              ${formData.retail_override || formData.retail_matrix_price || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Inventory Section with Metrics + Actions */}
      <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Inventory</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddInventoryModal(true)}
              className="h-7 text-xs border-gray-600"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Stock
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddToBuildModal(true)}
              className="h-7 text-xs border-gray-600"
            >
              <Wrench className="w-3 h-3 mr-1" />
              Add to Build
            </Button>
          </div>
        </div>
        
        {/* Canonical Metrics */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-2 bg-gray-900/50 rounded">
            <p className="text-xl font-bold text-white">{inventoryMetrics.physical_stock}</p>
            <p className="text-xs text-gray-400">On Hand</p>
          </div>
          <div className="text-center p-2 bg-gray-900/50 rounded">
            <p className="text-xl font-bold text-amber-400">{inventoryMetrics.reserved_global}</p>
            <p className="text-xs text-gray-400">Reserved</p>
          </div>
          <div className="text-center p-2 bg-gray-900/50 rounded">
            <p className="text-xl font-bold text-green-400">{inventoryMetrics.available_to_allocate}</p>
            <p className="text-xs text-gray-400">Available</p>
          </div>
          <div className="text-center p-2 bg-gray-900/50 rounded">
            <p className="text-xl font-bold text-blue-400">{inventoryMetrics.on_order}</p>
            <p className="text-xs text-gray-400">On Order</p>
          </div>
        </div>

        {/* Location Summary */}
        {Object.keys(locationSummary).length > 0 && (
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              By Location
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(locationSummary).map(([locId, data]) => {
                const loc = locations.find(l => l.id === locId);
                return (
                  <Badge key={locId} variant="outline" className="text-xs border-gray-600">
                    {loc?.bin_description || loc?.location_area || 'Unassigned'}: {data.qty}
                    {data.reserved > 0 && <span className="text-amber-400 ml-1">({data.reserved} reserved)</span>}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Vendor & Location */}
      <div className="grid grid-cols-2 gap-4">
        {vendor && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Vendor</p>
            <p className="text-white">{vendor.vendor_name}</p>
          </div>
        )}
        {location && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Location</p>
            <p className="text-white">{location.bin_description || location.location_area}</p>
          </div>
        )}
      </div>

      {/* Order URL */}
      {formData.order_url && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Order Link</p>
          <a 
            href={formData.order_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm"
          >
            <ExternalLink className="w-3 h-3" />
            {new URL(formData.order_url).hostname}
          </a>
        </div>
      )}

      {/* Notes */}
      {formData.notes && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Notes</p>
          <p className="text-white whitespace-pre-wrap text-sm">{formData.notes}</p>
        </div>
      )}

      {/* Project Usage */}
      <div className="pt-4 border-t border-gray-700">
        <PartProjectUsageSection partId={activePart.id} />
      </div>

      {/* Journal Section (Collapsible) */}
      <Collapsible open={journalSectionOpen} onOpenChange={setJournalSectionOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left border-t border-gray-700 pt-4">
          <span className="text-sm font-medium text-gray-300">Journal Entries</span>
          {journalSectionOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2">
            <PartJournalSection partId={activePart.id} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  // --- EDIT MODE ---
  const renderEditMode = () => (
    <form onSubmit={handleSave} className="space-y-6 p-4 overflow-y-auto max-h-[70vh]">
      {/* Basic Info */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="text-gray-400 text-xs">Part Name *</Label>
            <Input
              value={formData.part_name}
              onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
          
          <div>
            <Label className="text-gray-400 text-xs">Vendor Part #</Label>
            <Input
              value={formData.vendor_part_number || ''}
              onChange={(e) => setFormData({ ...formData, vendor_part_number: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
          
          <div>
            <Label className="text-gray-400 text-xs">Order URL</Label>
            <Input
              type="url"
              value={formData.order_url || ''}
              onChange={(e) => setFormData({ ...formData, order_url: e.target.value })}
              placeholder="https://..."
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
        </div>
      </div>

      {/* Car Make/Model/Year */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-gray-400 text-xs flex items-center justify-between">
            Car Make
            <button type="button" onClick={() => setShowCreateModal('CarMake')} className="text-xs text-blue-400 hover:text-blue-300">
              + New
            </button>
          </Label>
          <Select
            value={formData.car_make_id || 'none'}
            onValueChange={(value) => setFormData({ ...formData, car_make_id: value === 'none' ? '' : value, car_model_id: '', car_year_id: '' })}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {makes.filter(m => m.active).map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-gray-400 text-xs flex items-center justify-between">
            Car Model
            <button type="button" onClick={() => setShowCreateModal('CarModel')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!formData.car_make_id}>
              + New
            </button>
          </Label>
          <Select
            value={formData.car_model_id || 'none'}
            onValueChange={(value) => setFormData({ ...formData, car_model_id: value === 'none' ? '' : value, car_year_id: '' })}
            disabled={!formData.car_make_id}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {availableModels.filter(m => m.active).map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-gray-400 text-xs flex items-center justify-between">
            Year/Series
            <button type="button" onClick={() => setShowCreateModal('CarYear')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!formData.car_model_id}>
              + New
            </button>
          </Label>
          <Select
            value={formData.car_year_id || 'none'}
            onValueChange={(value) => setFormData({ ...formData, car_year_id: value === 'none' ? '' : value })}
            disabled={!formData.car_model_id}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {availableYears.filter(y => y.active).map(y => (
                <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Category, Vendor, Location */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-gray-400 text-xs flex items-center justify-between">
            Category
            <button type="button" onClick={() => setShowCreateModal('PartCategory')} className="text-xs text-blue-400 hover:text-blue-300">
              + New
            </button>
          </Label>
          <Select
            value={formData.part_category_id || 'none'}
            onValueChange={(value) => setFormData({ ...formData, part_category_id: value === 'none' ? '' : value })}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {activeCategories.filter(c => !c.parent_id).map(parent => {
                const children = activeCategories.filter(c => c.parent_id === parent.id);
                return (
                  <React.Fragment key={parent.id}>
                    <SelectItem value={parent.id}>
                      <span style={{ color: parent.color }}>{parent.name}</span>
                    </SelectItem>
                    {children.map(child => (
                      <SelectItem key={child.id} value={child.id}>
                        <span className="pl-4" style={{ color: child.color }}>↳ {child.name}</span>
                      </SelectItem>
                    ))}
                  </React.Fragment>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-gray-400 text-xs flex items-center justify-between">
            Vendor
            <button type="button" onClick={() => setShowCreateModal('Vendor')} className="text-xs text-blue-400 hover:text-blue-300">
              + New
            </button>
          </Label>
          <Select
            value={formData.default_vendor_id || 'none'}
            onValueChange={(value) => setFormData({ ...formData, default_vendor_id: value === 'none' ? '' : value })}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {activeVendors.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-gray-400 text-xs flex items-center justify-between">
            Location
            <button type="button" onClick={() => setShowCreateModal('Location')} className="text-xs text-blue-400 hover:text-blue-300">
              + New
            </button>
          </Label>
          <Select
            value={formData.location_id || 'none'}
            onValueChange={(value) => setFormData({ ...formData, location_id: value === 'none' ? '' : value })}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {activeLocations.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.bin_description || l.location_area}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Canonical Pricing Section */}
      <PartPricingFields
        defaultCost={formData.cost}
        defaultRetail={formData.retail_override || formData.retail_matrix_price}
        pricingMode={formData.pricing_mode || 'matrix'}
        appliedMarkupPct={formData.applied_markup_pct}
        onCostChange={(cost) => setFormData({ ...formData, cost })}
        onRetailChange={(retail) => setFormData({ ...formData, retail_override: retail })}
        onModeChange={(mode) => setFormData({ ...formData, pricing_mode: mode })}
      />

      {/* Notes */}
      <div>
        <Label className="text-gray-400 text-xs">Notes</Label>
        <Textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="bg-gray-800 border-gray-700 text-white"
          rows={3}
        />
      </div>

      {/* Media Section (Collapsible) */}
      <Collapsible open={mediaSectionOpen} onOpenChange={setMediaSectionOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left border-t border-gray-700 pt-4">
          <span className="text-sm font-medium text-gray-300">Photos ({formData.photos?.length || 0})</span>
          {mediaSectionOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2 space-y-3">
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <Button type="button" disabled={uploading} className="bg-red-600 hover:bg-red-700 gap-2" size="sm">
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4" />Upload</>
                  )}
                </Button>
              </label>
              
              <label className="cursor-pointer md:hidden">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <Button type="button" disabled={uploading} variant="outline" className="border-gray-700 gap-2" size="sm">
                  <Camera className="w-4 h-4" />Camera
                </Button>
              </label>
            </div>

            {formData.photos && formData.photos.length > 0 ? (
              <DragDropContext onDragEnd={handlePhotoDragEnd}>
                <Droppable droppableId="photos" direction="horizontal">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="flex gap-3 overflow-x-auto pb-2"
                    >
                      {formData.photos.map((url, index) => (
                        <Draggable key={url} draggableId={url} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 ${
                                formData.featured_photo === url ? 'border-yellow-500' : 'border-gray-700'
                              } ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                            >
                              <img src={url} alt="" className="w-full h-full object-cover" />
                              
                              <div className="absolute top-1 right-1 flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSetFeatured(url)}
                                  className={`p-1 rounded ${
                                    formData.featured_photo === url ? 'bg-yellow-500' : 'bg-black/50 hover:bg-yellow-500'
                                  }`}
                                  title="Set as featured"
                                >
                                  <Star className="w-3 h-3 text-white" fill={formData.featured_photo === url ? 'white' : 'none'} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(url)}
                                  className="p-1 bg-black/50 hover:bg-red-600 rounded"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3 h-3 text-white" />
                                </button>
                              </div>
                              
                              {formData.featured_photo === url && (
                                <div className="absolute bottom-0 left-0 right-0 bg-yellow-500 text-black text-xs text-center py-0.5 font-medium">
                                  Featured
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            ) : (
              <div className="text-center py-6 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 text-sm">
                No photos yet
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Journal Section (Collapsible in Edit Mode) */}
      <Collapsible open={journalSectionOpen} onOpenChange={setJournalSectionOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left border-t border-gray-700 pt-4">
          <span className="text-sm font-medium text-gray-300">Journal Entries</span>
          {journalSectionOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2">
            <PartJournalSection partId={activePart.id} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </form>
  );

  // --- FOOTER (always visible) ---
  const renderFooter = () => {
    if (editing) {
      return (
        <div className="flex gap-3 p-4 border-t border-red-900/30 bg-gray-900">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFormData({ ...activePart, photos: activePart.photos || [], featured_photo: activePart.featured_photo || '' });
              setEditing(false);
            }}
            className="flex-1 border-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {updateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      );
    }
    
    // View mode footer
    return (
      <div className="flex gap-3 p-4 border-t border-red-900/30 bg-gray-900">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="flex-1 border-gray-700"
        >
          Close
        </Button>
        <Button
          onClick={() => setEditing(true)}
          className="flex-1 bg-red-600 hover:bg-red-700"
        >
          <Edit2 className="w-4 h-4 mr-2" />
          Edit
        </Button>
      </div>
    );
  };

  // Mobile layout
  if (isMobile) {
    const mobileFooter = editing ? (
      <MobilePrimaryActionStack
        primaryAction={{
          label: updateMutation.isPending ? 'Saving...' : 'Save Changes',
          onClick: handleSave,
          disabled: updateMutation.isPending,
          loading: updateMutation.isPending,
        }}
        secondaryActions={[
          { label: 'Cancel', onClick: () => { setFormData({ ...activePart, photos: activePart.photos || [], featured_photo: activePart.featured_photo || '' }); setEditing(false); }, variant: 'outline' }
        ]}
      />
    ) : (
      <MobilePrimaryActionStack
        primaryAction={{
          label: 'Edit',
          onClick: () => setEditing(true),
          icon: Edit2,
        }}
        secondaryActions={[
          { label: 'Close', onClick: onClose, variant: 'outline' }
        ]}
      />
    );

    return (
      <>
        <Dialog open={true} onOpenChange={onClose}>
          <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30">
            <MobileModalWrapper
              title={formData.part_name}
              description={formData.vendor_part_number}
              onClose={onClose}
              footer={mobileFooter}
            >
              {editing ? renderEditMode() : renderViewMode()}
            </MobileModalWrapper>
          </DialogContent>
        </Dialog>
        
        {showCreateModal && (
          <CreateInlineModal
            entityType={showCreateModal}
            onClose={() => setShowCreateModal(null)}
            onCreate={handleInlineCreate}
            parentData={{
              car_make_id: formData.car_make_id,
              car_model_id: formData.car_model_id,
            }}
          />
        )}
        
        {/* Add Inventory Modal (Mobile) */}
        {showAddInventoryModal && activePart && (
          <AddInventoryModal
            part={activePart}
            onClose={() => setShowAddInventoryModal(false)}
          />
        )}
        
        {/* Add to Build Modal (Mobile) */}
        {showAddToBuildModal && activePart && (
          <AddToBuildModal
            part={activePart}
            onClose={() => setShowAddToBuildModal(false)}
          />
        )}
      </>
    );
  }

  // Desktop layout
  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-gray-900 border-red-900/30 p-0">
          <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-red-900/30">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-red-500" />
              <DialogTitle className="text-white">{formData.part_name}</DialogTitle>
            </div>
            <div className="flex gap-2">
              {editing && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm('Delete this part? This cannot be undone.')) {
                      deleteMutation.mutate();
                    }
                  }}
                  className="text-gray-400 hover:text-red-400"
                  title="Delete Part"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            {editing ? renderEditMode() : renderViewMode()}
          </div>
          
          {renderFooter()}
        </DialogContent>
      </Dialog>
      
      {showCreateModal && (
        <CreateInlineModal
          entityType={showCreateModal}
          onClose={() => setShowCreateModal(null)}
          onCreate={handleInlineCreate}
          parentData={{
            car_make_id: formData.car_make_id,
            car_model_id: formData.car_model_id,
          }}
        />
      )}
      
      {/* Add Inventory Modal */}
      {showAddInventoryModal && activePart && (
        <AddInventoryModal
          part={activePart}
          onClose={() => setShowAddInventoryModal(false)}
        />
      )}
      
      {/* Add to Build Modal */}
      {showAddToBuildModal && activePart && (
        <AddToBuildModal
          part={activePart}
          onClose={() => setShowAddToBuildModal(false)}
        />
      )}
    </>
  );
}