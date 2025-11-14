import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Plus, Package, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import UnifiedAddPartModal from "../parts/UnifiedAddPartModal";

export default function AddPartToProjectModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("existing");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [qtyNeeded, setQtyNeeded] = useState(1);
  const [assignmentStatus, setAssignmentStatus] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [showUnifiedModal, setShowUnifiedModal] = useState(false);

  const [newPart, setNewPart] = useState({
    part_name: "",
    vendor_part_number: "",
    car_make_id: "",
    car_model_id: "",
    car_year_id: "",
    part_category_id: "",
    location_id: "",
    cost: "",
    retail: "",
    quantity_on_hand: 0,
    vendor_id: "",
    status: "Need to Buy",
    notes: "",
    global_all_builds: false
  });

  const { data: allParts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const list = await base44.entities.PartCategory.list();
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

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const list = await base44.entities.Vendor.list();
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

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments', projectId],
    queryFn: () => base44.entities.PartBuildAssignment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list(),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: (data) => base44.entities.PartBuildAssignment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments', projectId] });
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
      toast.success('Part assigned to project');
      onClose();
    },
  });

  const createPartMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.create(data),
    onSuccess: (newPart) => {
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      createAssignmentMutation.mutate({
        part_id: newPart.id,
        project_id: projectId,
        needed_status: newPart.status,
        qty_needed: 1,
        qty_reserved: 0,
        notes: ""
      });
    },
  });

  const availableParts = allParts.filter(p => 
    (p.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     p.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getPartReserved = (partId) => {
    return allAssignments
      .filter(a => a.part_id === partId)
      .reduce((sum, a) => sum + (a.qty_needed || 0), 0);
  };

  const getPartAvailable = (partId) => {
    const part = allParts.find(p => p.id === partId);
    if (!part) return 0;
    const reserved = getPartReserved(partId);
    return (part.quantity_on_hand || 0) - reserved;
  };

  const handleAddExisting = () => {
    if (!selectedPartId) {
      toast.error('Please select a part');
      return;
    }

    const available = getPartAvailable(selectedPartId);
    const autoStatus = available >= qtyNeeded ? 'On-Hand' : 'On-Order';

    createAssignmentMutation.mutate({
      part_id: selectedPartId,
      project_id: projectId,
      needed_status: assignmentStatus || autoStatus,
      qty_needed: qtyNeeded,
      qty_reserved: 0,
      notes: assignmentNotes
    });
  };

  const handleCreateNew = () => {
    if (!newPart.part_name.trim()) {
      toast.error('Part name is required');
      return;
    }

    const partData = {
      ...newPart,
      cost: newPart.cost ? parseFloat(newPart.cost) : undefined,
      retail: newPart.retail ? parseFloat(newPart.retail) : undefined,
      quantity_on_hand: parseInt(newPart.quantity_on_hand) || 0,
    };

    // Remove empty string IDs
    if (!partData.car_make_id) delete partData.car_make_id;
    if (!partData.car_model_id) delete partData.car_model_id;
    if (!partData.car_year_id) delete partData.car_year_id;
    if (!partData.part_category_id) delete partData.part_category_id;
    if (!partData.location_id) delete partData.location_id;
    if (!partData.vendor_id) delete partData.vendor_id;

    createPartMutation.mutate(partData);
  };

  const availableModels = models.filter(m => m.car_make_id === newPart.car_make_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const availableYears = years.filter(y => y.car_model_id === newPart.car_model_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const getCategoryName = (catId) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return '';
    if (cat.parent_id) {
      const parent = categories.find(c => c.id === cat.parent_id);
      return parent ? `${parent.name} > ${cat.name}` : cat.name;
    }
    return cat.name;
  };

  const parentCategories = categories.filter(c => !c.parent_id && c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const parentLocations = locations.filter(l => !l.parent_id && l.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const parentVendors = vendors.filter(v => !v.parent_id && v.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-red-900/30 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-red-900/30">
          <h2 className="text-white text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5" />
            Add Part to Project
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <Tabs value={activeTab} onValueChange={(val) => {
            if (val === "new") {
              setShowUnifiedModal(true);
            } else {
              setActiveTab(val);
            }
          }}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="existing">From Inventory</TabsTrigger>
              <TabsTrigger value="new">Create New Part</TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="space-y-4">
              <div>
                <Label className="text-gray-400 text-xs">Search Parts</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search by name or part number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-400 text-xs">Select Part *</Label>
                <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Choose a part..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {availableParts.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        {searchTerm ? 'No parts match your search' : 'No parts in inventory'}
                      </div>
                    ) : (
                      availableParts.map(part => {
                        const available = getPartAvailable(part.id);
                        const assignedPartIds = existingAssignments.map(a => a.part_id);
                        const isAlreadyAssigned = assignedPartIds.includes(part.id);
                        
                        return (
                          <SelectItem key={part.id} value={part.id} disabled={isAlreadyAssigned}>
                            <div className="flex items-center justify-between gap-3 w-full">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="truncate">{part.part_name}</span>
                                {part.vendor_part_number && (
                                  <span className="text-xs text-gray-400 font-mono shrink-0">({part.vendor_part_number})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs font-semibold ${available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {available}
                                </span>
                                {isAlreadyAssigned && (
                                  <span className="text-xs text-yellow-400">(Assigned)</span>
                                )}
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedPartId && (
                <>
                  <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <p className="text-xs text-gray-400 mb-2">Selected Part Details:</p>
                    {(() => {
                      const part = allParts.find(p => p.id === selectedPartId);
                      if (!part) return null;
                      
                      const reserved = getPartReserved(selectedPartId);
                      const available = getPartAvailable(selectedPartId);
                      
                      return (
                        <div className="text-sm space-y-1">
                          <p className="text-white font-medium">{part.part_name}</p>
                          {part.vendor_part_number && (
                            <p className="text-gray-400 font-mono text-xs">Part #: {part.vendor_part_number}</p>
                          )}
                          {part.part_category_id && (
                            <p className="text-gray-400 text-xs">Category: {getCategoryName(part.part_category_id)}</p>
                          )}
                          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-700">
                            <div>
                              <p className="text-xs text-gray-500">Global Stock</p>
                              <p className="text-white font-semibold">{part.quantity_on_hand || 0}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Reserved</p>
                              <p className="text-yellow-400 font-semibold">{reserved}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Available</p>
                              <p className={`font-semibold ${available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {available}
                              </p>
                            </div>
                          </div>
                          {available < qtyNeeded && (
                            <p className="text-yellow-400 text-xs mt-2 bg-yellow-900/20 p-2 rounded">
                              ⚠️ Not enough available - will default to "On-Order" status
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-400 text-xs">Quantity Needed *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={qtyNeeded}
                        onChange={(e) => setQtyNeeded(parseInt(e.target.value) || 1)}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Status for This Build</Label>
                      <Select value={assignmentStatus} onValueChange={setAssignmentStatus}>
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Auto-determine" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>Auto (based on availability)</SelectItem>
                          <SelectItem value="On-Hand">On-Hand</SelectItem>
                          <SelectItem value="Need to Buy">Need to Buy</SelectItem>
                          <SelectItem value="On-Order">On-Order</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-400 text-xs">Assignment Notes</Label>
                    <Textarea
                      value={assignmentNotes}
                      onChange={(e) => setAssignmentNotes(e.target.value)}
                      placeholder="Any notes specific to this build..."
                      className="bg-gray-800 border-gray-700 text-white"
                      rows={2}
                    />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="new" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Part Name *</Label>
                  <Input
                    value={newPart.part_name}
                    onChange={(e) => setNewPart({ ...newPart, part_name: e.target.value })}
                    placeholder="e.g., Piston Ring Set"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Vendor Part #</Label>
                  <Input
                    value={newPart.vendor_part_number}
                    onChange={(e) => setNewPart({ ...newPart, vendor_part_number: e.target.value })}
                    placeholder="e.g., 99610511302"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Car Make</Label>
                  <Select
                    value={newPart.car_make_id || 'none'}
                    onValueChange={(value) => setNewPart({ ...newPart, car_make_id: value === 'none' ? '' : value, car_model_id: '', car_year_id: '' })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select make..." />
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
                  <Label className="text-gray-400 text-xs">Car Model</Label>
                  <Select
                    value={newPart.car_model_id || 'none'}
                    onValueChange={(value) => setNewPart({ ...newPart, car_model_id: value === 'none' ? '' : value, car_year_id: '' })}
                    disabled={!newPart.car_make_id}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select model..." />
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
                  <Label className="text-gray-400 text-xs">Year/Series</Label>
                  <Select
                    value={newPart.car_year_id || 'none'}
                    onValueChange={(value) => setNewPart({ ...newPart, car_year_id: value === 'none' ? '' : value })}
                    disabled={!newPart.car_model_id}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select year..." />
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Category</Label>
                  <Select
                    value={newPart.part_category_id || 'none'}
                    onValueChange={(value) => setNewPart({ ...newPart, part_category_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {parentCategories.map(parent => {
                        const children = categories.filter(c => c.parent_id === parent.id && c.active);
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.name}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>
                                  → {child.name}
                                </span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs">Vendor</Label>
                  <Select
                    value={newPart.vendor_id || 'none'}
                    onValueChange={(value) => setNewPart({ ...newPart, vendor_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {parentVendors.map(parent => {
                        const children = vendors.filter(v => v.parent_id === parent.id && v.active);
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.vendor_name}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>
                                  → {child.vendor_name}
                                </span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs">Location</Label>
                  <Select
                    value={newPart.location_id || 'none'}
                    onValueChange={(value) => setNewPart({ ...newPart, location_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {parentLocations.map(parent => {
                        const children = locations.filter(l => l.parent_id === parent.id && l.active);
                        return (
                          <React.Fragment key={parent.id}>
                            <SelectItem value={parent.id}>
                              <span style={{ color: parent.color }}>{parent.location_area}</span>
                            </SelectItem>
                            {children.map(child => (
                              <SelectItem key={child.id} value={child.id}>
                                <span className="ml-4" style={{ color: child.color }}>
                                  → {child.location_area}
                                </span>
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-gray-400 text-xs">Status</Label>
                <Select
                  value={newPart.status}
                  onValueChange={(value) => setNewPart({ ...newPart, status: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="On-Hand">On-Hand</SelectItem>
                    <SelectItem value="Need to Buy">Need to Buy</SelectItem>
                    <SelectItem value="On-Order">On-Order</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newPart.cost}
                    onChange={(e) => setNewPart({ ...newPart, cost: e.target.value })}
                    placeholder="0.00"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Retail</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newPart.retail}
                    onChange={(e) => setNewPart({ ...newPart, retail: e.target.value })}
                    placeholder="0.00"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Qty on Hand</Label>
                  <Input
                    type="number"
                    value={newPart.quantity_on_hand}
                    onChange={(e) => setNewPart({ ...newPart, quantity_on_hand: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-400 text-xs">Notes</Label>
                <Textarea
                  value={newPart.notes}
                  onChange={(e) => setNewPart({ ...newPart, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="bg-gray-800 border-gray-700 text-white"
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="global"
                  checked={newPart.global_all_builds}
                  onChange={(e) => setNewPart({ ...newPart, global_all_builds: e.target.checked })}
                  className="rounded border-gray-700"
                />
                <Label htmlFor="global" className="text-gray-400 text-xs cursor-pointer">
                  Make available for all builds (global)
                </Label>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex gap-3 p-4 border-t border-red-900/30">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-700 text-white"
            disabled={createAssignmentMutation.isPending || createPartMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={activeTab === "existing" ? handleAddExisting : handleCreateNew}
            disabled={
              createAssignmentMutation.isPending || 
              createPartMutation.isPending ||
              (activeTab === "existing" && !selectedPartId) ||
              (activeTab === "new" && !newPart.part_name.trim())
            }
            className="flex-1 bg-red-600 hover:bg-red-700 gap-2"
          >
            {(createAssignmentMutation.isPending || createPartMutation.isPending) ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {activeTab === "new" ? "Creating..." : "Adding..."}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {activeTab === "new" ? "Create & Assign" : "Assign Part"}
              </>
            )}
          </Button>
        </div>
      </div>

      {showUnifiedModal && (
        <UnifiedAddPartModal
          projectId={projectId}
          onClose={() => {
            setShowUnifiedModal(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}