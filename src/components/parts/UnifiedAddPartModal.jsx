import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, X, Wand2, Plus, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CreateInlineModal from "../common/CreateInlineModal";
import PartTypeSelector from "./PartTypeSelector";
import PartPricingFields from "./PartPricingFields";
import { PART_TYPES, getPartTypeBehavior, getPartTypeFieldVisibility, applyPartTypeDefaults } from "./partTypeBehavior";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

const normalizeUrl = (url) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }
  return trimmed;
};

export default function UnifiedAddPartModal({ onClose, projectId = null }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(null);
  
  // Vendor sources state managed locally for new parts (no partId yet)
  const [vendorSources, setVendorSources] = useState([]);
  const [formData, setFormData] = useState({
    part_name: "",
    vendor_part_number: "",
    order_url: "",
    car_make_id: "",
    car_model_id: "",
    car_year_id: "",
    part_category_id: "",
    default_vendor_id: "",
    // Pricing — canonical fields matching Edit Part
    pricing_mode: "matrix",
    cost: 0,
    retail_override: null,
    retail_matrix_price: null,
    applied_markup_pct: null,
    reorder_point: 0,
    reorder_quantity: 1,
    is_active: true,
    notes: "",
    photos: [],
    featured_photo: "",
    part_type: PART_TYPES.PURCHASED_VENDOR,
    production_cost: "",
    handling_fee: "",
    resale_value: "",
  });

  // Get field visibility based on part type
  const fieldVisibility = getPartTypeFieldVisibility(formData.part_type);

  // Handle part type change - apply defaults
  const handlePartTypeChange = (newType) => {
    const defaults = getPartTypeBehavior(newType);
    setFormData({
      ...formData,
      part_type: newType,
      ...defaults,
    });
  };

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
      return list.sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));
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

  // Matrix pricing derivation — identical to Edit Part
  useEffect(() => {
    if (formData.pricing_mode === 'matrix' && formData.cost > 0) {
      const fetchMatrixPrice = async () => {
        try {
          const res = await base44.functions.invoke('computeRetailFromMatrix', { cost: formData.cost });
          if (res.data?.success) {
            setFormData(prev => ({
              ...prev,
              retail_matrix_price: res.data.retail_matrix_price,
              applied_markup_pct: res.data.applied_markup_pct
            }));
          }
        } catch (err) {
          console.error('[AddPart MatrixPrice] Fetch failed:', err?.message);
        }
      };
      const timer = setTimeout(fetchMatrixPrice, 300);
      return () => clearTimeout(timer);
    }
  }, [formData.cost, formData.pricing_mode]);

  const createPartMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.create(data),
    onSuccess: async (newPart) => {
      const partIds = newPart?.id ? [newPart.id] : [];
      const projectIds = [];
      const commitmentIds = [];

      // Create vendor sources for the new part
      for (const source of vendorSources) {
        if (source.vendor_id) {
          await base44.entities.PartVendorSource.create({
            part_id: newPart.id,
            vendor_id: source.vendor_id,
            vendor_part_number: source.vendor_part_number || '',
            unit_cost: source.unit_cost || 0,
            order_url: source.order_url || '',
            is_preferred: source.is_preferred || false,
            is_active: true,
            sort_order: source.sort_order || 0,
          });
        }
      }
      
      // CANONICAL SUPPLY FLOW ENFORCED
      if (projectId) {
        projectIds.push(projectId);
        try {
          const response = await base44.functions.invoke('commitmentService', {
            action: 'addPartToProject',
            project_id: projectId,
            part_id: newPart.id,
            qty_committed: 1,
            notes: null,
            source_surface: 'UnifiedAddPartModal',
            requested_by: 'user'
          });

          if (response.data?.success && response.data.commitment_id) {
            commitmentIds.push(response.data.commitment_id);
          }
        } catch (error) {
          console.error('Failed to create commitment:', error);
        }
      }
      
      await forceAppRefresh(queryClient, { partIds, projectIds, commitmentIds });
      
      toast.success('Part created successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to create part');
    }
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map((file) =>
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map((r) => r.file_url);

      const updatedPhotos = [...(formData.photos || []), ...photoUrls];
      const newFeatured = formData.featured_photo || (updatedPhotos.length > 0 ? updatedPhotos[0] : '');
      
      setFormData({
        ...formData,
        photos: updatedPhotos,
        featured_photo: newFeatured
      });
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    const updatedPhotos = formData.photos.filter((url) => url !== urlToRemove);
    setFormData({
      ...formData,
      photos: updatedPhotos,
      featured_photo: formData.featured_photo === urlToRemove ? (updatedPhotos[0] || '') : formData.featured_photo
    });
  };

  const handleScrapeUrl = async () => {
    const url = normalizeUrl(formData.order_url);
    if (!url) {
      toast.error('Please enter a URL first');
      return;
    }
    
    console.log("SCRAPE URL INPUT", url);
    setScraping(true);
    try {
      const response = await base44.functions.invoke('scrapePartUrl', { url });
      console.log("SCRAPE RESPONSE", response.data);
      const data = response.data?.data;
      
      if (data) {
        const validImages = (data.image_urls || []).filter(u => u && u.startsWith('http'));
        
        setFormData(prev => ({
          ...prev,
          part_name: data.part_name || prev.part_name,
          vendor_part_number: data.part_number || prev.vendor_part_number,
          notes: data.notes || prev.notes,
          cost: data.price ? parseFloat(data.price) : prev.cost,
          order_url: url,
          photos: validImages.length > 0 ? [...prev.photos, ...validImages] : prev.photos,
          featured_photo: prev.featured_photo || (validImages.length > 0 ? validImages[0] : prev.featured_photo)
        }));
        
        const messages = [];
        if (data.part_name) messages.push('name');
        if (data.price) messages.push(`price ($${data.price})`);
        if (validImages.length > 0) messages.push(`${validImages.length} image(s)`);
        
        if (messages.length > 0) {
          toast.success(`Found: ${messages.join(', ')}`);
        } else {
          toast.warning('URL scraped but limited data found');
        }
      } else {
        toast.error('Could not extract product info from URL');
      }
    } catch (error) {
      console.error("SCRAPE ERROR FULL", error);
      console.error("SCRAPE STATUS", error?.response?.status);
      console.error("SCRAPE RESPONSE", error?.response?.data);
      const status = error?.response?.status;
      if (status === 404) {
        toast.error('Scrape function not found — check that scrapePartUrl is deployed');
      } else {
        toast.error(error?.response?.data?.error || 'Failed to scrape URL');
      }
    } finally {
      setScraping(false);
    }
  };

  // Handler: vendor source adds/changes for new part (before save)
  const handleAddVendorSource = () => {
    setVendorSources(prev => [
      ...prev,
      {
        _tempId: `new_${Date.now()}`,
        vendor_id: '',
        vendor_part_number: '',
        unit_cost: 0,
        order_url: '',
        is_preferred: prev.length === 0,
        sort_order: prev.length,
      },
    ]);
  };

  const handleRemoveVendorSource = (index) => {
    setVendorSources(prev => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (removed.is_preferred && updated.length > 0) {
        updated[0].is_preferred = true;
        setFormData(f => ({ ...f, default_vendor_id: updated[0].vendor_id, cost: updated[0].unit_cost || f.cost }));
      }
      return updated;
    });
  };

  const handleVendorSourceFieldChange = (index, field, value) => {
    setVendorSources(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSetVendorSourcePreferred = (index) => {
    setVendorSources(prev => {
      const updated = prev.map((s, i) => ({ ...s, is_preferred: i === index }));
      const preferred = updated[index];
      setFormData(f => ({ ...f, default_vendor_id: preferred.vendor_id, cost: preferred.unit_cost || f.cost }));
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const behaviorDefaults = getPartTypeBehavior(formData.part_type);
    
    const partData = {
      part_name: formData.part_name,
      vendor_part_number: formData.vendor_part_number,
      order_url: formData.order_url,
      car_make_id: formData.car_make_id,
      car_model_id: formData.car_model_id,
      car_year_id: formData.car_year_id,
      part_category_id: formData.part_category_id,
      default_vendor_id: formData.default_vendor_id,
      // Canonical pricing fields
      pricing_mode: formData.pricing_mode,
      cost: formData.cost || 0,
      retail_override: formData.pricing_mode === 'manual' ? formData.retail_override : null,
      retail_matrix_price: formData.pricing_mode === 'matrix' ? formData.retail_matrix_price : null,
      applied_markup_pct: formData.applied_markup_pct,
      // Part type + behavior
      part_type: formData.part_type,
      ...behaviorDefaults,
      is_active: formData.is_active,
      notes: formData.notes,
      photos: formData.photos,
      featured_photo: formData.featured_photo,
      reorder_point: parseInt(formData.reorder_point) || 0,
      reorder_quantity: parseInt(formData.reorder_quantity) || 1,
      production_cost: formData.production_cost ? parseFloat(formData.production_cost) : undefined,
      handling_fee: formData.handling_fee ? parseFloat(formData.handling_fee) : undefined,
      resale_value: formData.resale_value ? parseFloat(formData.resale_value) : undefined,
    };

    if (!partData.car_make_id) delete partData.car_make_id;
    if (!partData.car_model_id) delete partData.car_model_id;
    if (!partData.car_year_id) delete partData.car_year_id;
    if (!partData.part_category_id) delete partData.part_category_id;
    if (!partData.default_vendor_id) delete partData.default_vendor_id;

    createPartMutation.mutate(partData);
  };

  const activeCategories = categories.filter(c => c.active);
  const parentCategories = activeCategories.filter(c => !c.parent_id);
  
  const activeVendors = vendors.filter(v => v.active && v.vendor_type === 'PART');
  
  const activeLocations = locations.filter(l => l.active);
  const parentLocations = activeLocations.filter(l => !l.parent_id);
  
  const activeMakes = makes.filter(m => m.active);
  const availableModels = models.filter(m => m.car_make_id === formData.car_make_id && m.active);
  const availableYears = years.filter(y => y.car_model_id === formData.car_model_id && y.active);

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
      else if (entityType === 'CarMake') setFormData({ ...formData, car_make_id: newItem.id });
      else if (entityType === 'CarModel') setFormData({ ...formData, car_model_id: newItem.id });
      else if (entityType === 'CarYear') setFormData({ ...formData, car_year_id: newItem.id });
      
      toast.success(`${entityType} created`);
      setShowCreateModal(null);
    } catch (error) {
      toast.error(`Failed to create ${entityType}`);
    }
  };

  return (
    <div className="contents">
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30">
          <DialogHeader>
            <DialogTitle className="text-white">Add New Part</DialogTitle>
            <DialogDescription>
              Enter the details for a new part in your catalog.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Part Type Selector - First */}
            <PartTypeSelector
              value={formData.part_type}
              onChange={handlePartTypeChange}
              showDescription={true}
              showBehaviorFlags={true}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label className="text-gray-400">Part Name *</Label>
                <Input
                  required
                  value={formData.part_name}
                  onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="e.g., Piston Ring Set"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Vendor Part #</Label>
                <Input
                  value={formData.vendor_part_number}
                  onChange={(e) => setFormData({ ...formData, vendor_part_number: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="e.g., 99610511302"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400">Order URL</Label>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    value={formData.order_url}
                    onChange={(e) => setFormData({ ...formData, order_url: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white flex-1"
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleScrapeUrl}
                    disabled={scraping || !formData.order_url}
                    className="border-gray-700 hover:bg-purple-600 hover:border-purple-600"
                    title="Auto-populate from URL"
                  >
                    {scraping ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Car Make
                  <button type="button" onClick={() => setShowCreateModal('CarMake')} className="text-xs text-blue-400 hover:text-blue-300">+ New</button>
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
                    {activeMakes.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Car Model
                  <button type="button" onClick={() => setShowCreateModal('CarModel')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!formData.car_make_id}>+ New</button>
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
                    {availableModels.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Year/Series
                  <button type="button" onClick={() => setShowCreateModal('CarYear')} className="text-xs text-blue-400 hover:text-blue-300" disabled={!formData.car_model_id}>+ New</button>
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
                    {availableYears.map(y => (
                      <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400 flex items-center justify-between">
                  Category
                  <button type="button" onClick={() => setShowCreateModal('PartCategory')} className="text-xs text-blue-400 hover:text-blue-300">+ New</button>
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
                    {parentCategories.map(parent => {
                      const children = activeCategories.filter(c => c.parent_id === parent.id);
                      return [
                        <SelectItem key={parent.id} value={parent.id}>
                          <span style={{ color: parent.color }}>{parent.name}</span>
                        </SelectItem>,
                        ...children.map(child => (
                          <SelectItem key={child.id} value={child.id}>
                            <span className="ml-4" style={{ color: child.color }}>→ {child.name}</span>
                          </SelectItem>
                        ))
                      ];
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400">Default Vendor</Label>
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
                      <SelectItem key={v.id} value={v.id}>
                        <span style={{ color: v.color }}>{v.vendor_name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vendor Sources Section — same component as Edit Part */}
            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-gray-300 text-sm">Vendor Sources</Label>
                <button type="button" onClick={() => setShowCreateModal('Vendor')} className="text-xs text-blue-400 hover:text-blue-300">
                  + New Vendor
                </button>
              </div>
              <AddPartVendorSourcesInline
                sources={vendorSources}
                vendors={activeVendors}
                onAdd={handleAddVendorSource}
                onRemove={handleRemoveVendorSource}
                onFieldChange={handleVendorSourceFieldChange}
                onSetPreferred={handleSetVendorSourcePreferred}
              />
              <p className="text-[10px] text-gray-500">Preferred source syncs to default vendor &amp; cost.</p>
            </div>

            {/* Canonical Pricing Section — same component as Edit Part */}
            <PartPricingFields
              defaultCost={formData.cost}
              defaultRetail={formData.retail_override || formData.retail_matrix_price}
              pricingMode={formData.pricing_mode || 'matrix'}
              appliedMarkupPct={formData.applied_markup_pct}
              onCostChange={(cost) => setFormData({ ...formData, cost })}
              onRetailChange={(retail) => setFormData({ ...formData, retail_override: retail })}
              onModeChange={(mode) => setFormData({ ...formData, pricing_mode: mode })}
            />

            {/* Dynamic Part-Type-Specific Fields */}
            <div className="grid grid-cols-2 gap-4">
              {fieldVisibility.showProductionCost && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Production Cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.production_cost}
                    onChange={(e) => setFormData({ ...formData, production_cost: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Internal production cost"
                  />
                </div>
              )}

              {fieldVisibility.showHandlingFee && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Handling Fee</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.handling_fee}
                    onChange={(e) => setFormData({ ...formData, handling_fee: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Service/handling fee"
                  />
                </div>
              )}

              {fieldVisibility.showResaleValue && (
                <div className="space-y-2">
                  <Label className="text-gray-400">Resale Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.resale_value}
                    onChange={(e) => setFormData({ ...formData, resale_value: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Estimated resale value"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400">Reorder Point</Label>
                <Input
                  type="number"
                  value={formData.reorder_point}
                  onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="Min stock alert"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-gray-400">Reorder Quantity</Label>
                <Input
                  type="number"
                  value={formData.reorder_quantity}
                  onChange={(e) => setFormData({ ...formData, reorder_quantity: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="Qty to order"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
                placeholder="Additional notes..."
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active !== false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label className="text-gray-400 text-sm">Active in Catalog</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400">Photos</Label>
              <div className="flex flex-wrap gap-2">
                {formData.photos.map((url, idx) => (
                  <div key={idx} className="relative w-24 h-24 bg-gray-800 rounded border border-gray-700">
                    <img src={url} alt="" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(url)}
                      className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <label className="w-24 h-24 bg-gray-800 rounded border border-gray-700 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-gray-700">
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="text-xs text-gray-400 mt-1">Upload</span>
                    </>
                  )}
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPartMutation.isPending || !formData.part_name.trim()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {createPartMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Part'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {showCreateModal && (
        <CreateInlineModal
          entityType={showCreateModal}
          onClose={() => setShowCreateModal(null)}
          onCreate={handleInlineCreate}
          parentData={{
            car_make_id: formData.car_make_id,
            car_model_id: formData.car_model_id
          }}
        />
      )}
    </div>
  );
}

/* ─── Inline Vendor Sources for Add Part (no partId yet) ─── */

function AddPartVendorSourcesInline({ sources, vendors, onAdd, onRemove, onFieldChange, onSetPreferred }) {
  return (
    <div className="space-y-2">
      {sources.map((s, idx) => {
        const cheapestCost = sources.length > 1
          ? Math.min(...sources.filter(x => (x.unit_cost || 0) > 0).map(x => x.unit_cost))
          : 0;
        const isCheapest = s.unit_cost > 0 && s.unit_cost <= cheapestCost && sources.length > 1;

        return (
          <div key={s._tempId || idx} className={cn(
            "p-3 rounded-lg border space-y-2",
            s.is_preferred ? "bg-yellow-900/10 border-yellow-700/30" : "bg-gray-800/30 border-gray-700/50"
          )}>
            <div className="flex items-center gap-2">
              <Select
                value={s.vendor_id || "none"}
                onValueChange={(val) => onFieldChange(idx, "vendor_id", val === "none" ? "" : val)}
              >
                <SelectTrigger className="flex-1 bg-gray-800 border-gray-700 text-white h-8 text-sm">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select vendor...</SelectItem>
                  {vendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button" size="icon"
                variant={s.is_preferred ? "default" : "ghost"}
                className={cn("h-8 w-8 shrink-0", s.is_preferred ? "bg-yellow-600 hover:bg-yellow-700 text-white" : "text-gray-400 hover:text-yellow-400")}
                onClick={() => onSetPreferred(idx)}
                title={s.is_preferred ? "Preferred source" : "Set as preferred"}
              >
                <Star className="w-3.5 h-3.5" fill={s.is_preferred ? "currentColor" : "none"} />
              </Button>
              {isCheapest && (
                <span className="text-[9px] text-green-400 font-bold shrink-0">BEST</span>
              )}
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-red-400 hover:text-red-300" onClick={() => onRemove(idx)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Vendor Part #" value={s.vendor_part_number || ""} onChange={(e) => onFieldChange(idx, "vendor_part_number", e.target.value)} className="bg-gray-800 border-gray-700 text-white h-7 text-xs" />
              <Input type="number" step="0.01" min="0" placeholder="Unit cost" value={s.unit_cost || ""} onChange={(e) => onFieldChange(idx, "unit_cost", parseFloat(e.target.value) || 0)} className="bg-gray-800 border-gray-700 text-white h-7 text-xs" />
              <Input placeholder="Order URL" value={s.order_url || ""} onChange={(e) => onFieldChange(idx, "order_url", e.target.value)} className="bg-gray-800 border-gray-700 text-white h-7 text-xs" />
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="border-gray-600 text-gray-300 gap-1 w-full">
        <Plus className="w-3 h-3" /> Add Vendor Source
      </Button>
    </div>
  );
}