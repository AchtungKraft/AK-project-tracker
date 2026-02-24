import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Loader2, Edit2, Trash2, X, Upload, Star, ChevronDown, ChevronRight, 
  Camera, ExternalLink, Package, Plus, Wrench, MapPin, ChevronLeft
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
import { forceAppRefresh, extractRefreshContext } from "@/components/supply/forceAppRefresh";

// Helper to cancel all part-scoped queries for a given partId
const cancelPartQueries = (queryClient, partId) => {
  if (!partId) return;
  queryClient.cancelQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return (
        (key[0] === 'part' && key[1] === partId) ||
        (key[0] === 'partsInventoryView' && key[1] === partId) ||
        (key[0] === 'inventoryLocations' && key[1] === partId) ||
        (key[0] === 'partSupplyUsage' && key[1] === partId) ||
        (key[0] === 'partJournalEntries' && key[1] === partId)
      );
    }
  });
};

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
  
  // Image viewer modal state - supports step-through navigation
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  
  // File input ref for robust upload triggering
  const photoInputRef = useRef(null);

  // PERF FIX: Modal is "open" when mounted with a valid partId
  // Use this for gating all queries consistently
  const isOpen = Boolean(partId);
  const effectivePartId = partId || part?.id;
  
  // Track which partId we've initialized formData for - prevents overwrites during edits
  const initializedPartIdRef = useRef(null);
  
  // Dev diagnostic for tracking part switches
  if (process.env.NODE_ENV === 'development') {
    console.debug('[PartModal] effectivePartId:', effectivePartId);
  }
  
  // PHASE 3: Section health monitor - detect stuck queries
  const sectionHealthRef = useRef({});
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const checkStuckQueries = () => {
      const queryCache = queryClient.getQueryCache();
      const stuckThreshold = 4000; // 4 seconds
      const now = Date.now();
      
      queryCache.getAll().forEach(query => {
        const key = query.queryKey;
        const state = query.state;
        
        // Only check part-scoped queries
        if (!Array.isArray(key) || !key.some(k => k === effectivePartId)) return;
        
        if (state.fetchStatus === 'fetching') {
          const elapsed = now - (state.fetchMeta?.fetchMore?.timestamp || state.dataUpdatedAt || now);
          if (elapsed > stuckThreshold) {
            console.warn('[SECTION_HEALTH] Stuck query detected:', {
              queryKey: key,
              elapsed: `${elapsed}ms`,
              status: state.status,
              fetchStatus: state.fetchStatus,
            });
          }
        }
      });
    };
    
    const interval = setInterval(checkStuckQueries, 2000);
    return () => clearInterval(interval);
  }, [effectivePartId, queryClient]);
  
  // Track previous partId to cancel in-flight queries on switch
  const prevPartIdRef = useRef(null);

  // PERF FIX: Cancel in-flight queries when partId changes OR on unmount
  // This prevents stale data from resolving into UI after switching parts
  useEffect(() => {
    const prevId = prevPartIdRef.current;
    
    // If partId changed (not initial mount), cancel queries for previous part
    if (prevId && prevId !== effectivePartId) {
      cancelPartQueries(queryClient, prevId);
    }
    
    // Update ref to current
    prevPartIdRef.current = effectivePartId;
    
    // Cleanup: cancel queries for current part on unmount
    return () => {
      if (effectivePartId) {
        cancelPartQueries(queryClient, effectivePartId);
      }
    };
  }, [effectivePartId, queryClient]);
  
  // Wrap onClose to ensure queries are canceled before closing
  const handleClose = () => {
    if (effectivePartId) {
      cancelPartQueries(queryClient, effectivePartId);
    }
    onClose?.();
  };
  
  // Fetch part if only partId provided
  // PERF FIX: Add caching, retry control, and window focus handling
  // Normalize return shape to single object or null
  const { data: fetchedPart, isLoading: partLoading, error: partError } = useQuery({
    queryKey: ['part', partId],
    queryFn: async () => {
      const rows = await base44.entities.Part.filter({ id: partId });
      // Normalize: always return single object or null
      return rows?.[0] ?? null;
    },
    enabled: Boolean(isOpen && partId && !part),
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Stop retrying on rate limit or not found
      if (error?.status === 429 || error?.status === 404) return false;
      return failureCount < 1;
    },
  });

  const activePart = part || fetchedPart;
  
  // PERF FIX: Handle part not found - stop dependent queries
  const partNotFound = !partLoading && !activePart && isOpen && partId && !part;
  
  // PERF FIX: Handle part error - show error state instead of infinite spinner
  const partLoadError = partError && isOpen && partId;

  const [formData, setFormData] = useState(null);

  // Initialize formData when part is loaded
  // PHASE 1: Only include editable fields, NOT derived inventory fields
  // FIX: Only initialize ONCE per partId to prevent overwrites during editing/uploads
  useEffect(() => {
    if (!activePart?.id) return;
    
    // Skip if we've already initialized for this partId (prevents overwrite after upload/refetch)
    if (initializedPartIdRef.current === activePart.id) return;
    
    // Mark this partId as initialized
    initializedPartIdRef.current = activePart.id;
    
    setFormData({
      part_name: activePart.part_name || '',
      vendor_part_number: activePart.vendor_part_number || '',
      part_category_id: activePart.part_category_id || '',
      default_vendor_id: activePart.default_vendor_id || '',
      car_make_id: activePart.car_make_id || '',
      car_model_id: activePart.car_model_id || '',
      car_year_id: activePart.car_year_id || '',
      // Pricing fields (editable)
      pricing_mode: activePart.pricing_mode || 'matrix',
      cost: activePart.cost ?? 0,
      retail_override: activePart.retail_override ?? null,
      retail_matrix_price: activePart.retail_matrix_price ?? null,
      applied_markup_pct: activePart.applied_markup_pct ?? null,
      // Part type and flags
      part_type: activePart.part_type || 'PURCHASED_VENDOR',
      is_active: activePart.is_active ?? true,
      // Metadata
      notes: activePart.notes || '',
      order_url: activePart.order_url || '',
      photos: activePart.photos || [],
      featured_photo: activePart.featured_photo || '',
      // Reorder settings
      reorder_point: activePart.reorder_point ?? 0,
      reorder_quantity: activePart.reorder_quantity ?? 1,
      // EXPLICITLY OMIT: physical_stock, allocated_stock, on_order (derived/canonical)
    });
    setEditing(false);
  }, [activePart?.id]);
  
  // Reset initialization ref when partId changes to a different part
  useEffect(() => {
    if (effectivePartId && initializedPartIdRef.current !== effectivePartId) {
      initializedPartIdRef.current = null;
    }
  }, [effectivePartId]);

  // PHASE 2: Matrix pricing derivation - fetch from backend when cost changes in MATRIX mode
  // FIXED: Uses backend computeRetailFromMatrix to get correct tier + markup, not stale applied_markup_pct
  useEffect(() => {
    if (formData?.pricing_mode === 'matrix' && formData.cost > 0) {
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
          console.error('Matrix price fetch failed:', err);
        }
      };
      // Debounce to avoid excessive calls while typing
      const timer = setTimeout(fetchMatrixPrice, 300);
      return () => clearTimeout(timer);
    }
  }, [formData?.cost, formData?.pricing_mode]);

  // Fetch reference data - PERF FIX: Gate with isOpen, long cache, no refetch storms
  // These queries only fire when modal is open
  const refDataOptions = {
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0, // Reference data: no retry, just use cache
  };

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: isOpen,
    ...refDataOptions,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: isOpen,
    ...refDataOptions,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: isOpen,
    ...refDataOptions,
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: async () => {
      const list = await base44.entities.CarMake.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: isOpen,
    ...refDataOptions,
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: async () => {
      const list = await base44.entities.CarModel.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: isOpen,
    ...refDataOptions,
  });

  const { data: years = [] } = useQuery({
    queryKey: ['carYears'],
    queryFn: async () => {
      const list = await base44.entities.CarYear.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: isOpen,
    ...refDataOptions,
  });

  // PHASE 16: Single canonical source for inventory - scoped to this part only
  // PERF FIX: Gate with isOpen + effectivePartId, safe caching, retry control
  const {
    data: partInventoryView,
    isLoading: inventoryLoading,
    error: inventoryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: ['partsInventoryView', effectivePartId],
    queryFn: async () => {
      // Defensive: prevent late resolution into closed modal
      if (!effectivePartId) return null;
      if (process.env.NODE_ENV === 'development') {
        console.debug('[PartModal] inventoryQuery start', effectivePartId);
      }
      const res = await base44.functions.invoke('getPartsInventoryView', { part_id: effectivePartId });
      if (process.env.NODE_ENV === 'development') {
        console.debug('[PartModal] inventoryQuery success', effectivePartId);
      }
      return res.data?.parts?.[0] ?? null;
    },
    enabled: Boolean(isOpen && effectivePartId && !partNotFound),
    staleTime: 15000,
    gcTime: 60000,
    placeholderData: (prev) => prev, // keeps previous data during refetch (replaces keepPreviousData)
    networkMode: 'always',           // prevents pause in certain states
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error?.status === 429) return false;
      return failureCount < 1;
    },
  });

  // Location breakdown - ONLY used for location display, NOT for totals
  // This is a SECONDARY display, NOT a source of truth for inventory metrics
  // PERF FIX: Gate with isOpen + effectivePartId, add caching and retry control
  const { data: locationItems = [], isLoading: locationsLoading, error: locationsError } = useQuery({
    queryKey: ['inventoryLocations', effectivePartId],
    queryFn: async () => {
      // Defensive: prevent late resolution into closed modal
      if (!effectivePartId) return [];
      return base44.entities.InventoryItem.filter({ part_id: effectivePartId });
    },
    enabled: Boolean(isOpen && effectivePartId && !partNotFound),
    staleTime: 30000,
    gcTime: 120000,
    placeholderData: (prev) => prev, // keeps previous data during refetch
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error?.status === 429) return false;
      return failureCount < 1;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.update(activePart.id, data),
    onSuccess: async () => {
      // PHASE 17: Deterministic refresh - invalidate + refetch
      await forceAppRefresh(queryClient, { partIds: [activePart.id] });
      
      toast.success('Part updated');
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Part.delete(activePart.id),
    onSuccess: async () => {
      // PHASE 17: Deterministic refresh for delete
      await forceAppRefresh(queryClient, { partIds: [activePart.id] });
      toast.success('Part deleted');
      onClose();
    },
  });

  // PHASE 16: Canonical inventory metrics - SINGLE SOURCE, NO FALLBACK
  // If data not loaded, inventoryMetrics is null (render skeleton)
  // Safe fallback: use null coalescing to prevent undefined access
  const inventoryMetrics = partInventoryView ? {
    physical_stock: partInventoryView?.physical_stock ?? 0,
    reserved_global: partInventoryView?.allocated_total ?? 0,
    on_order: partInventoryView?.on_order ?? 0,
    available_to_allocate: partInventoryView?.available ?? 0,
    to_order: partInventoryView?.to_order ?? 0,
    required_total: partInventoryView?.required_total ?? 0,
  } : null;

  // Location breakdown - DISPLAY ONLY, not used for totals
  // This is clearly separated from canonical metrics
  const locationSummary = locationItems.reduce((acc, item) => {
    const locId = item.location_id || 'unassigned';
    if (!acc[locId]) acc[locId] = { qty: 0, reserved: 0 };
    acc[locId].qty += item.quantity_on_hand || 0;
    acc[locId].reserved += item.quantity_reserved || 0;
    return acc;
  }, {});

  /*
   * ===== UPLOAD DEBUG SUMMARY =====
   * Phase 1 instrumentation identified the following:
   * A) onChange DOES fire - files received correctly
   * B) formData.photos DOES update after upload (functional setState works)
   * C) State WAS being overwritten by useEffect watching activePart?.id
   *    - Fix: Added initializedPartIdRef to skip re-init during editing
   * D) Save WAS sending photos correctly in updatePayload
   * E) DB DOES persist photos - issue was frontend state reset
   * 
   * ROOT CAUSE: useEffect re-initialized formData when activePart reference
   * changed after forceAppRefresh, overwriting uploaded photos.
   * FIX: initializedPartIdRef prevents re-init for same partId.
   */

  // Photo handlers - MANDATORY: Use functional state updates to prevent stale closures
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    
    // DEV: Phase 1A - Log to confirm onChange fires
    if (process.env.NODE_ENV === 'development') {
      console.log('[UPLOAD_DEBUG A] onChange fired:', {
        fileCount: files.length,
        fileNames: files.map(f => f.name),
        currentPhotosLength: formData?.photos?.length || 0,
      });
    }
    
    if (files.length === 0) return;
    
    // Reset input value so selecting same file again works
    if (e.target) e.target.value = '';

    setUploading(true);
    try {
      const uploadPromises = files.map(file => 
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const newPhotoUrls = results.map(r => r.file_url);
      
      // MANDATORY: Functional state update to prevent stale closures
      setFormData(prev => {
        const updatedPhotos = [...(prev.photos || []), ...newPhotoUrls];
        const newFeatured = prev.featured_photo || (updatedPhotos.length > 0 ? updatedPhotos[0] : '');
        
        // DEV: Phase 1B - Confirm state update
        if (process.env.NODE_ENV === 'development') {
          console.log('[UPLOAD_DEBUG B] State update:', {
            prevPhotosLength: prev.photos?.length || 0,
            newPhotosLength: updatedPhotos.length,
            newUrls: newPhotoUrls,
          });
        }
        
        return { ...prev, photos: updatedPhotos, featured_photo: newFeatured };
      });
      
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (url) => {
    setFormData(prev => {
      const updatedPhotos = (prev.photos || []).filter(p => p !== url);
      const newFeatured = prev.featured_photo === url ? '' : prev.featured_photo;
      return { ...prev, photos: updatedPhotos, featured_photo: newFeatured };
    });
  };

  const handleSetFeatured = (url) => {
    setFormData(prev => ({ ...prev, featured_photo: url }));
  };

  const handlePhotoDragEnd = (result) => {
    if (!result.destination) return;
    setFormData(prev => {
      const photos = Array.from(prev.photos || []);
      const [removed] = photos.splice(result.source.index, 1);
      photos.splice(result.destination.index, 0, removed);
      return { ...prev, photos };
    });
  };
  
  // Image viewer handlers with keyboard navigation
  const openImageViewer = useCallback((index) => {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);
  
  const closeImageViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);
  
  const nextImage = useCallback(() => {
    setViewerIndex(prev => {
      const photos = formData?.photos || [];
      return photos.length > 0 ? (prev + 1) % photos.length : 0;
    });
  }, [formData?.photos]);
  
  const prevImage = useCallback(() => {
    setViewerIndex(prev => {
      const photos = formData?.photos || [];
      return photos.length > 0 ? (prev - 1 + photos.length) % photos.length : 0;
    });
  }, [formData?.photos]);
  
  // Keyboard event handler for image viewer
  useEffect(() => {
    if (!viewerOpen) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeImageViewer();
      } else if (e.key === 'ArrowRight') {
        nextImage();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerOpen, closeImageViewer, nextImage, prevImage]);

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
    
    // PHASE 1: Build safe update payload - ONLY editable fields
    // EXPLICITLY OMIT: physical_stock, allocated_stock, on_order, reserved_global, reserved_project
    const updatePayload = {
      // Core identification
      part_name: formData.part_name,
      vendor_part_number: formData.vendor_part_number,
      part_category_id: formData.part_category_id,
      default_vendor_id: formData.default_vendor_id,
      car_make_id: formData.car_make_id,
      car_model_id: formData.car_model_id,
      car_year_id: formData.car_year_id,
      // Pricing fields (safe to update)
      pricing_mode: formData.pricing_mode,
      cost: formData.cost,
      retail_override: formData.pricing_mode === 'manual' ? formData.retail_override : null,
      retail_matrix_price: formData.pricing_mode === 'matrix' ? formData.retail_matrix_price : null,
      applied_markup_pct: formData.applied_markup_pct,
      // Part type and flags
      part_type: formData.part_type,
      is_active: formData.is_active,
      // Metadata
      notes: formData.notes,
      order_url: formData.order_url,
      photos: formData.photos,
      featured_photo: formData.featured_photo,
      // Reorder settings
      reorder_point: formData.reorder_point,
      reorder_quantity: formData.reorder_quantity,
    };

    // DEV: Phase 1D - Confirm save payload includes photos
    if (process.env.NODE_ENV === 'development') {
      console.log('[UPLOAD_DEBUG D] Save payload:', {
        photosLength: updatePayload.photos?.length || 0,
        featured_photo: updatePayload.featured_photo,
        photos: updatePayload.photos,
      });
    }

    // PHASE 16: Simplified - drift detection handled by canonical refetch
    updateMutation.mutate(updatePayload);
  };

  // Loading state
  if ((partId && !part && partLoading) || !formData) {
    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-900 border-red-900/30">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // PERF FIX: Part not found - show error state, don't spin forever
  if (partNotFound) {
    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-900 border-red-900/30">
          <DialogHeader>
            <DialogTitle className="text-white">Part Not Found</DialogTitle>
            <DialogDescription className="text-gray-400">
              The requested part could not be loaded. It may have been deleted or you may not have access.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={handleClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  // PERF FIX: Part load error - show error state, don't spin forever
  if (partLoadError) {
    const errorMessage = partError?.status === 429 
      ? 'Rate limited - please wait a moment and try again' 
      : 'Unable to load part details';
    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-900 border-red-900/30">
          <DialogHeader>
            <DialogTitle className="text-white">Error Loading Part</DialogTitle>
            <DialogDescription className="text-red-400">
              {errorMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={handleClose}>Close</Button>
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
      {/* Photos Gallery - Click to open step-through viewer */}
      {formData.photos && formData.photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {formData.photos.map((url, idx) => (
            <div 
              key={idx} 
              onClick={() => openImageViewer(idx)}
              className={`aspect-square bg-gray-800 rounded border overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${
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
        {formData.part_type && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Part Type</p>
            <Badge 
              variant="outline" 
              className={`text-xs ${
                formData.part_type === 'PURCHASED_VENDOR' ? 'border-blue-500 text-blue-400' :
                formData.part_type === 'AK_MANUFACTURED' ? 'border-purple-500 text-purple-400' :
                formData.part_type === 'CLIENT_SUPPLIED' ? 'border-amber-500 text-amber-400' :
                formData.part_type === 'TAKE_OFF' ? 'border-teal-500 text-teal-400' :
                'border-gray-500 text-gray-400'
              }`}
            >
              {formData.part_type.replace(/_/g, ' ')}
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
      <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Pricing</span>
          <Badge variant="outline" className={`text-xs ${formData.pricing_mode === 'manual' ? 'border-purple-500 text-purple-400' : 'border-blue-500 text-blue-400'}`}>
            {formData.pricing_mode === 'manual' ? 'Manual' : 'Matrix'}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Cost</p>
            <p className="text-white font-semibold">${(formData.cost || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Retail</p>
            <p className="text-white font-semibold">
              ${(formData.retail_override || formData.retail_matrix_price || 0).toFixed(2)}
            </p>
          </div>
          {formData.applied_markup_pct != null && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Markup</p>
              <p className="text-white font-semibold">{(formData.applied_markup_pct * 100).toFixed(0)}%</p>
            </div>
          )}
        </div>
      </div>

      {/* Inventory Section - PHASE 16: Single Canonical Source */}
      <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Inventory</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddInventoryModal(true)}
              className="h-6 text-[11px] px-2 border-gray-600"
            >
              <Plus className="w-3 h-3 mr-1" />
              Stock
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddToBuildModal(true)}
              className="h-6 text-[11px] px-2 border-gray-600"
            >
              <Wrench className="w-3 h-3 mr-1" />
              Build
            </Button>
          </div>
        </div>
        
        {/* PHASE 16: Canonical Metrics - Error state breaks loading loop */}
        {inventoryError ? (
          <div className="text-red-400 text-xs bg-red-900/20 px-2 py-1.5 rounded">
            Failed to load inventory data
          </div>
        ) : inventoryLoading || !inventoryMetrics ? (
          <div className="flex items-center gap-2 bg-gray-900/60 px-2 py-1.5 rounded animate-pulse">
            <div className="h-3 w-16 bg-gray-700 rounded" />
            <div className="h-3 w-12 bg-gray-700 rounded" />
            <div className="h-3 w-14 bg-gray-700 rounded" />
            <div className="h-3 w-10 bg-gray-700 rounded" />
          </div>
        ) : (
          <>
            {/* Primary metrics row */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] bg-gray-900/60 px-2 py-1.5 rounded">
              <span className="text-white">Stock <span className="font-bold">{inventoryMetrics.physical_stock}</span></span>
              <span className="text-gray-500">•</span>
              <span className="text-amber-400">Res <span className="font-bold">{inventoryMetrics.reserved_global}</span></span>
              <span className="text-gray-500">•</span>
              <span className="text-green-400">Avail <span className="font-bold">{inventoryMetrics.available_to_allocate}</span></span>
              <span className="text-gray-500">•</span>
              <span className="text-blue-400">Ord <span className="font-bold">{inventoryMetrics.on_order}</span></span>
              {inventoryMetrics.to_order > 0 && (
                <>
                  <span className="text-gray-500">•</span>
                  <span className="text-blue-400 font-semibold">ToOrd <span className="font-bold">{inventoryMetrics.to_order}</span></span>
                </>
              )}
            </div>
            
            {/* Secondary metrics row - demand & reorder */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-gray-400 px-2">
              {inventoryMetrics.required_total > 0 && (
                <span>Req <span className="text-white font-bold">{inventoryMetrics.required_total}</span></span>
              )}
              {(formData.reorder_point > 0 || formData.reorder_quantity > 0) && (
                <>
                  {inventoryMetrics.required_total > 0 && <span className="text-gray-600">|</span>}
                  <span>ROP <span className="text-white">{formData.reorder_point}</span></span>
                  <span>ROQ <span className="text-white">{formData.reorder_quantity}</span></span>
                </>
              )}
            </div>

            {/* Reorder warning badge */}
            {formData.reorder_quantity > 0 && inventoryMetrics.available_to_allocate <= formData.reorder_point && (
              <Badge 
                variant="outline" 
                className={`text-[10px] ${
                  inventoryMetrics.available_to_allocate < formData.reorder_point 
                    ? 'border-red-500 text-red-400 bg-red-900/20' 
                    : 'border-amber-500 text-amber-400 bg-amber-900/20'
                }`}
              >
                Below Reorder Point
              </Badge>
            )}
          </>
        )}

        {/* Location Breakdown - DISPLAY ONLY (not used for totals) */}
        {!locationsLoading && Object.keys(locationSummary).length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <MapPin className="w-3 h-3 text-gray-500" />
            {Object.entries(locationSummary).slice(0, 3).map(([locId, data]) => {
              const loc = locations.find(l => l.id === locId);
              return (
                <span key={locId} className="text-gray-400">
                  {loc?.bin_description || loc?.location_area || '?'}: <span className="text-white">{data.qty}</span>
                  {data.reserved > 0 && <span className="text-amber-400/70">({data.reserved})</span>}
                </span>
              );
            })}
            {Object.keys(locationSummary).length > 3 && (
              <span className="text-gray-500">+{Object.keys(locationSummary).length - 3} more</span>
            )}
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
            {(() => {
              try {
                return new URL(formData.order_url).hostname;
              } catch {
                return formData.order_url;
              }
            })()}
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

      {/* Project Usage - PERF FIX: Pass isOpen to gate query */}
      <div className="pt-4 border-t border-gray-700">
        <PartProjectUsageSection partId={activePart.id} isOpen={isOpen} />
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
            <PartJournalSection partId={activePart.id} isOpen={isOpen && journalSectionOpen} />
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
              {/* Group vendors by parent_id, alpha sort groups and items */}
              {(() => {
                // Get parent vendors (no parent_id), sorted alphabetically
                const parentVendors = activeVendors
                  .filter(v => !v.parent_id)
                  .sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));
                
                // Get orphan vendors (have parent_id but parent not found or inactive)
                const parentIds = new Set(parentVendors.map(v => v.id));
                const childVendors = activeVendors.filter(v => v.parent_id);
                const orphanVendors = childVendors
                  .filter(v => !parentIds.has(v.parent_id))
                  .sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));
                
                return (
                  <>
                    {parentVendors.map(parent => {
                      const children = activeVendors
                        .filter(v => v.parent_id === parent.id)
                        .sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));
                      return (
                        <React.Fragment key={parent.id}>
                          <SelectItem value={parent.id}>
                            <span style={{ color: parent.color || '#3B82F6' }}>{parent.vendor_name}</span>
                          </SelectItem>
                          {children.map(child => (
                            <SelectItem key={child.id} value={child.id}>
                              <span className="pl-4" style={{ color: child.color || '#3B82F6' }}>↳ {child.vendor_name}</span>
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {/* Render orphan vendors at the end */}
                    {orphanVendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        <span style={{ color: v.color || '#3B82F6' }}>{v.vendor_name}</span>
                      </SelectItem>
                    ))}
                  </>
                );
              })()}
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
              {/* Group locations by parent_id, alpha sort groups and items */}
              {(() => {
                // Get parent locations (no parent_id), sorted alphabetically
                const parentLocations = activeLocations
                  .filter(l => !l.parent_id)
                  .sort((a, b) => (a.location_area || '').localeCompare(b.location_area || ''));
                
                // Get orphan locations (have parent_id but parent not found or inactive)
                const parentIds = new Set(parentLocations.map(l => l.id));
                const childLocations = activeLocations.filter(l => l.parent_id);
                const orphanLocations = childLocations
                  .filter(l => !parentIds.has(l.parent_id))
                  .sort((a, b) => (a.bin_description || a.location_area || '').localeCompare(b.bin_description || b.location_area || ''));
                
                return (
                  <>
                    {parentLocations.map(parent => {
                      const children = activeLocations
                        .filter(l => l.parent_id === parent.id)
                        .sort((a, b) => (a.bin_description || a.location_area || '').localeCompare(b.bin_description || b.location_area || ''));
                      return (
                        <React.Fragment key={parent.id}>
                          <SelectItem value={parent.id}>
                            <span style={{ color: parent.color || '#8B5CF6' }}>{parent.bin_description || parent.location_area}</span>
                          </SelectItem>
                          {children.map(child => (
                            <SelectItem key={child.id} value={child.id}>
                              <span className="pl-4" style={{ color: child.color || '#8B5CF6' }}>↳ {child.bin_description || child.location_area}</span>
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {/* Render orphan locations at the end */}
                    {orphanLocations.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        <span style={{ color: l.color || '#8B5CF6' }}>{l.bin_description || l.location_area}</span>
                      </SelectItem>
                    ))}
                  </>
                );
              })()}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Part Type & Reorder Settings */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-gray-400 text-xs">Part Type</Label>
          <Select
            value={formData.part_type || 'PURCHASED_VENDOR'}
            onValueChange={(value) => setFormData({ ...formData, part_type: value })}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PURCHASED_VENDOR">Purchased Vendor</SelectItem>
              <SelectItem value="AK_MANUFACTURED">AK Manufactured</SelectItem>
              <SelectItem value="CLIENT_SUPPLIED">Client Supplied</SelectItem>
              <SelectItem value="TAKE_OFF">Take Off</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-gray-400 text-xs">Reorder Point</Label>
          <Input
            type="number"
            min={0}
            value={formData.reorder_point ?? 0}
            onChange={(e) => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>

        <div>
          <Label className="text-gray-400 text-xs">Reorder Quantity</Label>
          <Input
            type="number"
            min={0}
            value={formData.reorder_quantity ?? 1}
            onChange={(e) => setFormData({ ...formData, reorder_quantity: parseInt(e.target.value) || 1 })}
            className="bg-gray-800 border-gray-700 text-white"
          />
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
              {/* Hidden file input with ref for robust triggering */}
              <input
                ref={photoInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <Button 
                type="button" 
                disabled={uploading} 
                className="bg-red-600 hover:bg-red-700 gap-2" 
                size="sm"
                onClick={() => photoInputRef.current?.click()}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4" />Upload</>
                )}
              </Button>
              
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
            <PartJournalSection partId={activePart.id} isOpen={isOpen && journalSectionOpen} />
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
          onClick={handleClose}
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
          { label: 'Close', onClick: handleClose, variant: 'outline' }
        ]}
      />
    );

    return (
      <>
        <Dialog open={true} onOpenChange={handleClose}>
          <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30">
            <MobileModalWrapper
              title={formData.part_name}
              description={formData.vendor_part_number}
              onClose={handleClose}
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
            preselectedPartId={activePart.id}
            onClose={async () => {
              setShowAddInventoryModal(false);
              // PHASE 16: Invalidate + explicit refetch
              invalidateSupplyQueries(queryClient, { part_ids: [activePart.id] });
              queryClient.invalidateQueries({ queryKey: ['partsInventoryView', activePart.id] });
              queryClient.invalidateQueries({ queryKey: ['inventoryLocations', activePart.id] });
              await refetchInventory();
            }}
          />
        )}
        
        {/* Add to Build Modal (Mobile) */}
        {showAddToBuildModal && activePart && (
          <AddToBuildModal
            part={activePart}
            onClose={async () => {
              setShowAddToBuildModal(false);
              // PHASE 16: Invalidate + explicit refetch
              invalidateSupplyQueries(queryClient, { part_ids: [activePart.id] });
              queryClient.invalidateQueries({ queryKey: ['partsInventoryView', activePart.id] });
              await refetchInventory();
            }}
          />
        )}
      </>
    );
  }

  // Desktop layout
  return (
    <>
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-gray-900 border-red-900/30 p-0">
          <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-red-900/30">
            <div className="flex items-center gap-3 flex-col items-start">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-red-500" />
                <DialogTitle className="text-white">{formData.part_name}</DialogTitle>
              </div>
              <DialogDescription className="text-gray-400 text-sm">
                View and edit part details, pricing, and inventory.
              </DialogDescription>
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
          preselectedPartId={activePart.id}
          onClose={async () => {
            setShowAddInventoryModal(false);
            // PHASE 17: Deterministic refresh
            await forceAppRefresh(queryClient, { partIds: [activePart.id] });
            await refetchInventory();
          }}
        />
      )}
      
      {/* Add to Build Modal */}
      {showAddToBuildModal && activePart && (
        <AddToBuildModal
          part={activePart}
          onClose={async () => {
            setShowAddToBuildModal(false);
            // PHASE 17: Deterministic refresh
            await forceAppRefresh(queryClient, { partIds: [activePart.id] });
            await refetchInventory();
          }}
        />
      )}
      
      {/* Image Viewer Modal with Step-Through Navigation */}
      {viewerOpen && formData?.photos?.length > 0 && (
        <Dialog open={true} onOpenChange={closeImageViewer}>
          <DialogContent className="max-w-5xl bg-black/95 border-gray-800 p-0 overflow-hidden">
            <div className="relative flex items-center justify-center min-h-[60vh] max-h-[85vh]">
              {/* Left click zone / prev button */}
              {formData.photos.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); prevImage(); }}
                  className="absolute left-0 top-0 bottom-0 w-1/4 flex items-center justify-start pl-4 opacity-0 hover:opacity-100 transition-opacity z-10 cursor-pointer"
                  aria-label="Previous image"
                >
                  <div className="bg-black/60 rounded-full p-2">
                    <ChevronLeft className="w-8 h-8 text-white" />
                  </div>
                </button>
              )}
              
              {/* Image */}
              <img
                src={formData.photos[viewerIndex] || ''}
                alt={`Part photo ${viewerIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain select-none"
                onClick={(e) => e.stopPropagation()}
              />
              
              {/* Right click zone / next button */}
              {formData.photos.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); nextImage(); }}
                  className="absolute right-0 top-0 bottom-0 w-1/4 flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity z-10 cursor-pointer"
                  aria-label="Next image"
                >
                  <div className="bg-black/60 rounded-full p-2">
                    <ChevronRight className="w-8 h-8 text-white" />
                  </div>
                </button>
              )}
              
              {/* Close button */}
              <button
                onClick={closeImageViewer}
                className="absolute top-4 right-4 bg-black/60 rounded-full p-2 hover:bg-black/80 transition-colors z-20"
                aria-label="Close viewer"
              >
                <X className="w-6 h-6 text-white" />
              </button>
              
              {/* Image counter */}
              {formData.photos.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-3 py-1 rounded-full text-white text-sm">
                  {viewerIndex + 1} / {formData.photos.length}
                </div>
              )}
            </div>
            
            {/* Thumbnail strip */}
            {formData.photos.length > 1 && (
              <div className="flex gap-2 p-3 bg-black/80 overflow-x-auto justify-center">
                {formData.photos.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setViewerIndex(idx)}
                    className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                      idx === viewerIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-75'
                    }`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}