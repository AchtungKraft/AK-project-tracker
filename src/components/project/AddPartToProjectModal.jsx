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

export default function AddPartToProjectModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("existing");
  const [searchTerm, setSearchTerm] = useState("");

  // State for adding existing part
  const [selectedPartId, setSelectedPartId] = useState("");
  const [qtyNeeded, setQtyNeeded] = useState(1);
  const [assignmentStatus, setAssignmentStatus] = useState("Need to Buy");
  const [assignmentNotes, setAssignmentNotes] = useState("");

  // State for new part
  const [newPart, setNewPart] = useState({
    part_name: "",
    vendor_part_number: "",
    car_year: "",
    car_model: "",
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
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments', projectId],
    queryFn: () => base44.entities.PartBuildAssignment.filter({ project_id: projectId }),
    enabled: !!projectId,
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
      // Also create assignment
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

  // Show all parts, not just unassigned
  const availableParts = allParts.filter(p => 
    (p.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     p.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Calculate reserved qty for each part
  const { data: allAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list(),
  });

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

    createPartMutation.mutate({
      ...newPart,
      cost: newPart.cost ? parseFloat(newPart.cost) : undefined,
      retail: newPart.retail ? parseFloat(newPart.retail) : undefined,
      quantity_on_hand: parseInt(newPart.quantity_on_hand) || 0,
    });
  };

  const getCategoryName = (catId) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return '';
    if (cat.parent_id) {
      const parent = categories.find(c => c.id === cat.parent_id);
      return parent ? `${parent.name} > ${cat.name}` : cat.name;
    }
    return cat.name;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-red-900/30 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-red-900/30">
          <h2 className="text-white text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5" />
            Add Part to Project
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="existing">From Inventory</TabsTrigger>
              <TabsTrigger value="new">Create New Part</TabsTrigger>
            </TabsList>

            {/* Add from existing inventory */}
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
                        {searchTerm ? 'No parts match your search' : 'No available parts to assign'}
                      </div>
                    ) : (
                      availableParts.map(part => (
                        <SelectItem key={part.id} value={part.id}>
                          <div className="flex items-center gap-2">
                            <span>{part.part_name}</span>
                            {part.vendor_part_number && (
                              <span className="text-xs text-gray-400 font-mono">({part.vendor_part_number})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))
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
                          <p className="text-gray-400 text-xs">Global Stock: {part.quantity_on_hand || 0}</p>
                          <p className="text-gray-400 text-xs">Reserved: {reserved}</p>
                          <p className={`text-xs font-semibold ${available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            Available: {available}
                          </p>
                          {available < qtyNeeded && (
                            <p className="text-yellow-400 text-xs mt-2">⚠️ Not enough in stock - will be set to Order</p>
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
                      <Label className="text-gray-400 text-xs">Status for This Build *</Label>
                      <Select value={assignmentStatus} onValueChange={setAssignmentStatus}>
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

            {/* Create new part */}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Car Year</Label>
                  <Input
                    value={newPart.car_year}
                    onChange={(e) => setNewPart({ ...newPart, car_year: e.target.value })}
                    placeholder="e.g., 1989"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Car Model</Label>
                  <Input
                    value={newPart.car_model}
                    onChange={(e) => setNewPart({ ...newPart, car_model: e.target.value })}
                    placeholder="e.g., 911 Carrera"
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Category</Label>
                  <Select
                    value={newPart.part_category_id}
                    onValueChange={(value) => setNewPart({ ...newPart, part_category_id: value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.active).map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span style={{ color: cat.color }}>{getCategoryName(cat.id)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Vendor</Label>
                  <Select
                    value={newPart.vendor_id}
                    onValueChange={(value) => setNewPart({ ...newPart, vendor_id: value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.filter(v => v.active).map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.vendor_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Location</Label>
                  <Select
                    value={newPart.location_id}
                    onValueChange={(value) => setNewPart({ ...newPart, location_id: value })}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.filter(l => l.active).map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.location_area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

        {/* Footer */}
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
    </div>
  );
}