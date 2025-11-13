import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, Check, X, QrCode } from "lucide-react";
import { toast } from "sonner";

export default function LocationsConfig() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newLocation, setNewLocation] = useState({ 
    location_area: '', 
    storage_type: '', 
    bin_description: '', 
    qr_code_value: '',
    notes: '',
    active: true
  });
  const [editing, setEditing] = useState(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Location.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location created');
      setNewLocation({ location_area: '', storage_type: '', bin_description: '', qr_code_value: '', notes: '', active: true });
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Location.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location updated');
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Location.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location deleted');
    },
  });

  const handleToggleActive = (location) => {
    updateMutation.mutate({ 
      id: location.id, 
      data: { ...location, active: !location.active } 
    });
  };

  // Group locations by area
  const locationsByArea = locations.reduce((acc, location) => {
    const area = location.location_area || 'Unassigned';
    if (!acc[area]) {
      acc[area] = [];
    }
    acc[area].push(location);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {showAdd && (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardHeader className="border-b border-red-900/30">
            <CardTitle className="text-white">Add New Location</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location Area</Label>
                  <Input
                    placeholder="e.g., Shop Floor, Warehouse A"
                    value={newLocation.location_area}
                    onChange={(e) => setNewLocation({ ...newLocation, location_area: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Storage Type</Label>
                  <Input
                    placeholder="e.g., Shelf, Bin, Pallet"
                    value={newLocation.storage_type}
                    onChange={(e) => setNewLocation({ ...newLocation, storage_type: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bin/Description</Label>
                  <Input
                    placeholder="e.g., A-3-5"
                    value={newLocation.bin_description}
                    onChange={(e) => setNewLocation({ ...newLocation, bin_description: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>QR Code Value</Label>
                  <Input
                    placeholder="Scannable value"
                    value={newLocation.qr_code_value}
                    onChange={(e) => setNewLocation({ ...newLocation, qr_code_value: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={newLocation.notes}
                  onChange={(e) => setNewLocation({ ...newLocation, notes: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAdd(false);
                    setNewLocation({ location_area: '', storage_type: '', bin_description: '', qr_code_value: '', notes: '', active: true });
                  }}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newLocation)}
                  disabled={!newLocation.location_area.trim() || createMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Create Location
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!showAdd && (
        <div className="flex justify-end">
          <Button 
            onClick={() => setShowAdd(true)}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        Object.entries(locationsByArea).map(([area, areaLocations]) => (
          <Card key={area} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
            <CardHeader className="border-b border-red-900/30">
              <CardTitle className="text-white">{area}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-2">
                {areaLocations.map((location) => (
                  <div 
                    key={location.id}
                    className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {editing === location.id ? (
                          <div className="space-y-3">
                            <Input
                              value={location.location_area}
                              onChange={(e) => {
                                const currentLocations = queryClient.getQueryData(['locations']) || [];
                                const updated = currentLocations.map(l => 
                                  l.id === location.id ? { ...l, location_area: e.target.value } : l
                                );
                                queryClient.setQueryData(['locations'], updated);
                              }}
                              className="bg-gray-800 border-gray-700 text-white"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                placeholder="Storage type..."
                                value={location.storage_type || ''}
                                onChange={(e) => {
                                  const currentLocations = queryClient.getQueryData(['locations']) || [];
                                  const updated = currentLocations.map(l => 
                                    l.id === location.id ? { ...l, storage_type: e.target.value } : l
                                  );
                                  queryClient.setQueryData(['locations'], updated);
                                }}
                                className="bg-gray-800 border-gray-700 text-white"
                              />
                              <Input
                                placeholder="Bin description..."
                                value={location.bin_description || ''}
                                onChange={(e) => {
                                  const currentLocations = queryClient.getQueryData(['locations']) || [];
                                  const updated = currentLocations.map(l => 
                                    l.id === location.id ? { ...l, bin_description: e.target.value } : l
                                  );
                                  queryClient.setQueryData(['locations'], updated);
                                }}
                                className="bg-gray-800 border-gray-700 text-white"
                              />
                            </div>
                            <Input
                              placeholder="QR code value..."
                              value={location.qr_code_value || ''}
                              onChange={(e) => {
                                const currentLocations = queryClient.getQueryData(['locations']) || [];
                                const updated = currentLocations.map(l => 
                                  l.id === location.id ? { ...l, qr_code_value: e.target.value } : l
                                );
                                queryClient.setQueryData(['locations'], updated);
                              }}
                              className="bg-gray-800 border-gray-700 text-white"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className={`font-semibold text-white ${!location.active && 'opacity-50'}`}>
                                {location.storage_type && `${location.storage_type} - `}
                                {location.bin_description || 'No bin specified'}
                              </h3>
                              {location.qr_code_value && (
                                <QrCode className="w-4 h-4 text-red-400" />
                              )}
                            </div>
                            {location.qr_code_value && (
                              <p className="text-sm text-gray-400 mb-1">
                                QR: <span className="font-mono">{location.qr_code_value}</span>
                              </p>
                            )}
                            {location.notes && (
                              <p className="text-sm text-gray-500">{location.notes}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        {editing === location.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                const currentLocations = queryClient.getQueryData(['locations']) || [];
                                const locationToUpdate = currentLocations.find(l => l.id === location.id);
                                if (locationToUpdate) {
                                  updateMutation.mutate({ id: location.id, data: locationToUpdate });
                                }
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing(null);
                                queryClient.invalidateQueries({ queryKey: ['locations'] });
                              }}
                              className="border-gray-700"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400">Active</span>
                              <Switch
                                checked={location.active}
                                onCheckedChange={() => handleToggleActive(location)}
                              />
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditing(location.id)}
                              className="text-gray-400 hover:text-white"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm('Delete this location?')) {
                                  deleteMutation.mutate(location.id);
                                }
                              }}
                              className="text-gray-400 hover:text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}