import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, ChevronRight, ChevronDown, GripVertical, Upload, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ImageGallery from "../parts/ImageGallery";
import { getLocationTypeConfig, getLocationTypeOptions } from "../inventory/locationTypeConfig";

export default function LocationsConfig() {
  const queryClient = useQueryClient();
  const [newLocation, setNewLocation] = useState({
    location_area: "",
    parent_id: "",
    location_type: "",
    short_code: "",
    storage_type: "",
    bin_description: "",
    qr_code_value: "",
    notes: "",
    description: "",
    photos: [],
    color: "#8B5CF6",
    sort_order: 0
  });
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const list = await base44.entities.Location.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Location.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setNewLocation({ location_area: "", parent_id: "", location_type: "", short_code: "", storage_type: "", bin_description: "", qr_code_value: "", notes: "", description: "", photos: [], color: "#8B5CF6", sort_order: 0 });
      toast.success('Location created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Location.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setEditing(null);
      toast.success('Location updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Location.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location deleted');
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newLocation.location_area.trim()) return;
    createMutation.mutate({ ...newLocation, active: true });
  };

  const handleFileUpload = async (e, isEditing = false, locationId = null) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(file => base44.integrations.Core.UploadFile({ file }));
      const results = await Promise.all(uploadPromises);
      const newPhotoUrls = results.map(r => r.file_url);

      if (isEditing && locationId) {
        const location = locations.find(l => l.id === locationId);
        const updatedPhotos = [...(location.photos || []), ...newPhotoUrls];
        const updated = locations.map(l => 
          l.id === locationId ? { ...l, photos: updatedPhotos } : l
        );
        queryClient.setQueryData(['locations'], updated);
      } else {
        setNewLocation(prev => ({
          ...prev,
          photos: [...(prev.photos || []), ...newPhotoUrls]
        }));
      }
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (photoUrl, isEditing = false, locationId = null) => {
    if (isEditing && locationId) {
      const location = locations.find(l => l.id === locationId);
      const updatedPhotos = (location.photos || []).filter(p => p !== photoUrl);
      const updated = locations.map(l => 
        l.id === locationId ? { ...l, photos: updatedPhotos } : l
      );
      queryClient.setQueryData(['locations'], updated);
    } else {
      setNewLocation(prev => ({
        ...prev,
        photos: (prev.photos || []).filter(p => p !== photoUrl)
      }));
    }
  };

  const handleOpenGallery = (photos, startIndex = 0) => {
    setGalleryImages(photos);
    setCurrentImageIndex(startIndex);
    setGalleryOpen(true);
  };

  const handleNavigateGallery = (direction) => {
    if (typeof direction === 'number') {
      setCurrentImageIndex(direction);
    } else if (direction === 'next') {
      setCurrentImageIndex((prev) => Math.min(prev + 1, galleryImages.length - 1));
    } else if (direction === 'prev') {
      setCurrentImageIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleToggleActive = (location) => {
    updateMutation.mutate({ id: location.id, data: { ...location, active: !location.active } });
  };

  const handleDragEnd = async (result, parentId = null) => {
    if (!result.destination) return;

    const itemsToReorder = parentId 
      ? locations.filter(l => l.parent_id === parentId)
      : locations.filter(l => !l.parent_id);

    const reordered = Array.from(itemsToReorder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    const updates = reordered.map((item, index) => ({
      id: item.id,
      data: { ...item, sort_order: index }
    }));

    const allLocations = locations.map(l => {
      const update = updates.find(u => u.id === l.id);
      return update ? { ...l, ...update.data } : l;
    });
    queryClient.setQueryData(['locations'], allLocations.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    try {
      await Promise.all(updates.map(u => base44.entities.Location.update(u.id, u.data)));
      toast.success('Order updated');
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.error('Failed to update order');
    }
  };

  const parentLocations = locations.filter(l => !l.parent_id);
  const childrenMap = {};
  locations.forEach(location => {
    if (location.parent_id) {
      if (!childrenMap[location.parent_id]) childrenMap[location.parent_id] = [];
      childrenMap[location.parent_id].push(location);
    }
  });

  const renderLocation = (location, index, parentId = null) => {
    const hasChildren = childrenMap[location.id]?.length > 0;
    const isCollapsed = collapsed[location.id];
    const isEditing = editing === location.id;

    return (
      <Draggable key={location.id} draggableId={location.id} index={index}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.draggableProps}>
            <div className={`p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors ${
              snapshot.isDragging ? 'shadow-lg border border-red-900/50' : ''
            }`}>
              <div className="flex items-start gap-3">
                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing mt-1">
                  <GripVertical className="w-5 h-5 text-gray-500" />
                </div>
                
                {hasChildren && (
                  <button onClick={() => setCollapsed(prev => ({ ...prev, [location.id]: !prev[location.id] }))} 
                          className="text-gray-400 hover:text-white mt-1">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
                {!hasChildren && <div className="w-4" />}

                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        value={location.location_area}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, location_area: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-gray-500 text-[10px]">Location Type</Label>
                          <Select
                            value={location.location_type || "none"}
                            onValueChange={(value) => {
                              const updated = locations.map(l =>
                                l.id === location.id ? { ...l, location_type: value === "none" ? "" : value } : l
                              );
                              queryClient.setQueryData(['locations'], updated);
                            }}
                          >
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No type</SelectItem>
                              {getLocationTypeOptions().map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <span style={{ color: opt.color }}>{opt.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-gray-500 text-[10px]">Short Code</Label>
                          <Input
                            value={location.short_code || ''}
                            onChange={(e) => {
                              const updated = locations.map(l =>
                                l.id === location.id ? { ...l, short_code: e.target.value } : l
                              );
                              queryClient.setQueryData(['locations'], updated);
                            }}
                            placeholder="e.g., T2, A3"
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                      </div>
                      <Input
                        value={location.bin_description || ''}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, bin_description: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        placeholder="Bin/shelf description..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Input
                        value={location.qr_code_value || ''}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, qr_code_value: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        placeholder="QR code value..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Textarea
                        value={location.notes || ''}
                        onChange={(e) => {
                          const updated = locations.map(l => 
                            l.id === location.id ? { ...l, notes: e.target.value } : l
                          );
                          queryClient.setQueryData(['locations'], updated);
                        }}
                        placeholder="Notes..."
                        className="bg-gray-800 border-gray-700 text-white"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={location.color || '#8B5CF6'}
                          onChange={(e) => {
                            const updated = locations.map(l => 
                              l.id === location.id ? { ...l, color: e.target.value } : l
                            );
                            queryClient.setQueryData(['locations'], updated);
                          }}
                          className="w-16 h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                        />
                        <Select
                          value={location.parent_id || "none"}
                          onValueChange={(value) => {
                            const updated = locations.map(l => 
                              l.id === location.id ? { ...l, parent_id: value === "none" ? "" : value } : l
                            );
                            queryClient.setQueryData(['locations'], updated);
                          }}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Parent (Top Level)</SelectItem>
                            {parentLocations.filter(p => p.id !== location.id).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.location_area}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-gray-400 text-xs">Photos</Label>
                        <div className="space-y-2">
                          {location.photos && location.photos.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {location.photos.map((photo, idx) => (
                                <div key={idx} className="relative">
                                  <img
                                    src={photo}
                                    alt={`Photo ${idx + 1}`}
                                    className="w-20 h-20 object-cover rounded border border-gray-700 cursor-pointer"
                                    onClick={() => handleOpenGallery(location.photos, idx)}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemovePhoto(photo, true, location.id);
                                    }}
                                    className="absolute -top-1 -right-1 bg-red-600 rounded-full w-5 h-5 flex items-center justify-center text-white hover:bg-red-700"
                                  >
                                    <XIcon className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <label className="cursor-pointer">
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded hover:bg-gray-750 transition-colors">
                              <Upload className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-400">
                                {uploading ? 'Uploading...' : 'Upload Photos'}
                              </span>
                            </div>
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, true, location.id)}
                              disabled={uploading}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const tc = getLocationTypeConfig(location.location_type);
                          const TIcon = tc.icon;
                          return <TIcon className="w-4 h-4 shrink-0" style={{ color: location.color || tc.color }} />;
                        })()}
                        <span className="font-medium text-white" style={{ color: location.color }}>
                          {location.location_area}
                        </span>
                        {location.location_type && (
                          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-500">{getLocationTypeConfig(location.location_type).label}</Badge>
                        )}
                        {location.short_code && (
                          <span className="text-[10px] font-mono text-gray-500">[{location.short_code}]</span>
                        )}
                        {!location.active && (
                          <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">Inactive</Badge>
                        )}
                        {location.photos && location.photos.length > 0 && (
                          <Badge 
                            variant="outline" 
                            className="text-xs border-blue-500 text-blue-400 cursor-pointer hover:bg-blue-950/30"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenGallery(location.photos, 0);
                            }}
                          >
                            <ImageIcon className="w-3 h-3 mr-1" />
                            {location.photos.length} photo{location.photos.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 mt-1 space-y-1">
                        {location.storage_type && <p>Type: {location.storage_type}</p>}
                        {location.bin_description && <p>Bin: {location.bin_description}</p>}
                        {location.qr_code_value && <p className="font-mono text-xs">QR: {location.qr_code_value}</p>}
                        {location.notes && <p className="italic text-gray-500">{location.notes}</p>}
                      </div>
                      {location.photos && location.photos.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {location.photos.slice(0, 3).map((photo, idx) => (
                            <img
                              key={idx}
                              src={photo}
                              alt={`Location photo ${idx + 1}`}
                              className="w-12 h-12 object-cover rounded border border-gray-700 cursor-pointer hover:border-red-500 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenGallery(location.photos, idx);
                              }}
                            />
                          ))}
                          {location.photos.length > 3 && (
                            <div className="w-12 h-12 bg-gray-800 rounded border border-gray-700 flex items-center justify-center text-xs text-gray-400">
                              +{location.photos.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => updateMutation.mutate({ id: location.id, data: location })}
                              className="h-8 w-8 text-green-400">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['locations'] }); }}
                              className="h-8 w-8 text-gray-400">
                        <XIcon className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" 
                              onClick={() => handleToggleActive(location)}
                              className="h-8 w-8 text-gray-400">
                        <span className="text-xs">{location.active ? '✓' : '○'}</span>
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => setEditing(location.id)}
                              className="h-8 w-8 text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" 
                              onClick={() => {
                                if (confirm('Delete this location?')) deleteMutation.mutate(location.id);
                              }}
                              className="h-8 w-8 text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {hasChildren && !isCollapsed && (
              <div className="ml-8 mt-2 space-y-2">
                <DragDropContext onDragEnd={(result) => handleDragEnd(result, location.id)}>
                  <Droppable droppableId={`children-${location.id}`}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {childrenMap[location.id].map((child, childIndex) => renderLocation(child, childIndex, location.id))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>
            )}
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base">Storage Locations</CardTitle>
        <p className="text-sm text-gray-400 mt-1">Create and manage storage locations for your shop</p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Storage Name *</Label>
              <Input
                value={newLocation.location_area}
                onChange={(e) => setNewLocation({ ...newLocation, location_area: e.target.value })}
                placeholder="e.g., Warehouse A, Shop Floor"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Parent Location</Label>
              <Select
                value={newLocation.parent_id || "none"}
                onValueChange={(value) => setNewLocation({ ...newLocation, parent_id: value === "none" ? "" : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {parentLocations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Type</Label>
              <Select
                value={newLocation.location_type || "none"}
                onValueChange={(value) => setNewLocation({ ...newLocation, location_type: value === "none" ? "" : value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No type</SelectItem>
                  {getLocationTypeOptions().map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span style={{ color: opt.color }}>{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Short Code</Label>
              <Input
                value={newLocation.short_code}
                onChange={(e) => setNewLocation({ ...newLocation, short_code: e.target.value })}
                placeholder="e.g., T2, EC-9106"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          {/* Advanced fields — hidden by default */}
          {showAdvancedCreate && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-800">
              <div>
                <Label className="text-gray-400 text-xs">Shelf / Bin ID</Label>
                <Input
                  value={newLocation.bin_description}
                  onChange={(e) => setNewLocation({ ...newLocation, bin_description: e.target.value })}
                  placeholder="e.g., A-3-5, Shelf 12"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Color</Label>
                <input
                  type="color"
                  value={newLocation.color}
                  onChange={(e) => setNewLocation({ ...newLocation, color: e.target.value })}
                  className="w-full h-10 rounded border border-gray-700 bg-gray-800 cursor-pointer"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-400 text-xs">Notes</Label>
                <Textarea
                  value={newLocation.notes}
                  onChange={(e) => setNewLocation({ ...newLocation, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="bg-gray-800 border-gray-700 text-white"
                  rows={2}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-gray-400 text-xs">Photos</Label>
                <div className="space-y-2">
                  {newLocation.photos && newLocation.photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {newLocation.photos.map((photo, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={photo}
                            alt={`Photo ${idx + 1}`}
                            className="w-20 h-20 object-cover rounded border border-gray-700 cursor-pointer"
                            onClick={() => handleOpenGallery(newLocation.photos, idx)}
                          />
                          <button
                            onClick={() => handleRemovePhoto(photo)}
                            className="absolute -top-1 -right-1 bg-red-600 rounded-full w-5 h-5 flex items-center justify-center text-white hover:bg-red-700"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded hover:bg-gray-750 transition-colors">
                      <Upload className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">
                        {uploading ? 'Uploading...' : 'Upload Photos'}
                      </span>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, false)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-2">
              {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Location</>}
            </Button>
            <button
              type="button"
              onClick={() => setShowAdvancedCreate(!showAdvancedCreate)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showAdvancedCreate ? 'Hide advanced' : 'Show advanced options'}
            </button>
          </div>
        </form>

        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Existing Locations</Label>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : locations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No locations yet</div>
          ) : (
            <DragDropContext onDragEnd={(result) => handleDragEnd(result, null)}>
              <Droppable droppableId="parents">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {parentLocations.map((location, index) => renderLocation(location, index, null))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </CardContent>

      <ImageGallery
        isOpen={galleryOpen}
        images={galleryImages}
        currentIndex={currentImageIndex}
        onClose={() => setGalleryOpen(false)}
        onNavigate={handleNavigateGallery}
      />
    </Card>
  );
}