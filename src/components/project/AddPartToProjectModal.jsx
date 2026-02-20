import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import UnifiedAddPartModal from "../parts/UnifiedAddPartModal";

export default function AddPartToProjectModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("existing");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [qtyNeeded, setQtyNeeded] = useState(1);
  const [priority, setPriority] = useState("Normal");
  const [notes, setNotes] = useState("");
  const [showUnifiedModal, setShowUnifiedModal] = useState(false);

  const { data: allParts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  // Check existing COMMITMENTS (canonical), not deprecated requirements
  const { data: existingCommitments = [] } = useQuery({
    queryKey: ['partCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ 
      project_id: projectId,
      commitment_status: { $nin: ['cancelled', 'closed'] }
    }),
    enabled: !!projectId,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  /**
   * CANONICAL SUPPLY FLOW ENFORCED
   * All project part mutations must go through executeSupplyAction dispatcher.
   * Direct entity writes are blocked.
   */
  const createRequirementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPartId) {
        throw new Error('Please select a part');
      }

      // Use canonical dispatcher - ADJUST_REQUIRED creates if missing
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADJUST_REQUIRED',
        commitment_ids: [], // Empty - will create new
        payload: {
          project_id: projectId,
          part_id: selectedPartId,
          required_total_set: qtyNeeded,
          source_type: 'SHOP_PURCHASED'
        },
        dry_run: false
      });

      const result = response.data;
      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['partCommitments', projectId] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectSupplyView', projectId] });
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['partSupplyUsage'] });
      
      const message = result.is_new_commitment 
        ? `Part added: ${result.required_total} required, ${result.reserved_from_stock} reserved`
        : `Requirement updated to ${result.required_total}`;
      toast.success(message);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to add part: ' + error.message);
    }
  });

  const availableParts = allParts.filter(p => 
    p.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInventoryAvailable = (partId) => {
    const items = inventoryItems.filter(i => i.part_id === partId);
    return items.reduce((sum, i) => sum + ((i.quantity_on_hand || 0) - (i.quantity_reserved || 0)), 0);
  };

  const handleAddExisting = () => {
    createRequirementMutation.mutate();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Add Part Requirement
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(val) => {
          if (val === "new") {
            setShowUnifiedModal(true);
          } else {
            setActiveTab(val);
          }
        }}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="existing">From Catalog</TabsTrigger>
            <TabsTrigger value="new">Create New Part</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-4">
            <div>
              <Label className="text-gray-300">Search Parts</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search by name or part number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-700"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-300">Select Part *</Label>
              <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Choose a part..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableParts.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      {searchTerm ? 'No parts match your search' : 'No parts in catalog'}
                    </div>
                  ) : (
                    availableParts.slice(0, 50).map(part => {
                      const available = getInventoryAvailable(part.id);
                      const existingCommitment = existingCommitments.find(c => c.part_id === part.id);
                      
                      return (
                        <SelectItem key={part.id} value={part.id}>
                          <div className="flex items-center justify-between gap-3 w-full">
                            <div className="flex-1 min-w-0">
                              <span className="truncate">{part.part_name}</span>
                              {part.vendor_part_number && (
                                <span className="text-xs text-gray-400 ml-2">({part.vendor_part_number})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-semibold ${available > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                                {available} avail
                              </span>
                              {existingCommitment && (
                                <span className="text-xs text-yellow-400">
                                  ({existingCommitment.required_total} in project)
                                </span>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-300">Quantity Needed *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={qtyNeeded}
                      onChange={(e) => setQtyNeeded(parseInt(e.target.value) || 1)}
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger className="bg-gray-800 border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Normal">Normal</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-gray-300">Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Project-specific notes..."
                    className="bg-gray-800 border-gray-700 h-20"
                  />
                </div>

                {/* Availability Warning */}
                {(() => {
                  const available = getInventoryAvailable(selectedPartId);
                  if (available < qtyNeeded) {
                    return (
                      <div className="p-3 bg-yellow-900/20 border border-yellow-900/30 rounded-lg">
                        <p className="text-sm text-yellow-300">
                          ⚠️ Only {available} available in inventory. You'll need to order {qtyNeeded - available} more.
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 pt-4 border-t border-gray-700">
          <Button variant="outline" onClick={onClose} className="flex-1 border-gray-700">
            Cancel
          </Button>
          <Button
            onClick={handleAddExisting}
            disabled={createRequirementMutation.isPending || !selectedPartId}
            className="flex-1 bg-red-600 hover:bg-red-700 gap-2"
          >
            {createRequirementMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Requirement
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      {showUnifiedModal && (
        <UnifiedAddPartModal
          projectId={projectId}
          onClose={() => {
            setShowUnifiedModal(false);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}