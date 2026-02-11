import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, MapPin, Package, ClipboardCheck, Calendar, User, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const ORIGIN_LABELS = {
  client_supplied: "Client Supplied",
  vehicle_removed: "Vehicle Removed",
  fabricated: "Fabricated",
  refurbished: "Refurbished",
  purchased_non_catalog: "Purchased (Non-Catalog)"
};

const CONDITION_CONFIG = {
  unknown: { label: "Unknown", color: "border-gray-500 text-gray-400" },
  inspection_required: { label: "Inspection Required", color: "border-yellow-500 text-yellow-400" },
  repair_required: { label: "Repair Required", color: "border-red-500 text-red-400" },
  ready: { label: "Ready", color: "border-green-500 text-green-400" },
  installed: { label: "Installed", color: "border-blue-500 text-blue-400" },
  scrapped: { label: "Scrapped", color: "border-gray-600 text-gray-500" }
};

export default function MaterialInstanceDetailModal({ instance, open, onOpenChange, onInspect }) {
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ['materialInspections'],
    queryFn: () => base44.entities.MaterialInspection.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  if (!instance) return null;

  const location = locations.find(l => l.id === instance.current_location_id);
  const linkedPart = parts.find(p => p.id === instance.part_id);
  const linkedProject = projects.find(p => p.id === instance.project_id);
  const linkedInventory = inventoryItems.filter(i => i.material_instance_id === instance.id);
  const instanceInspections = inspections
    .filter(i => i.material_instance_id === instance.id)
    .sort((a, b) => new Date(b.inspection_date) - new Date(a.inspection_date));

  const conditionConfig = CONDITION_CONFIG[instance.condition_status] || CONDITION_CONFIG.unknown;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-purple-500" />
            Material Instance
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instance Info */}
          <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <h3 className="text-white font-medium text-lg mb-2">{instance.instance_name}</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="outline" className={conditionConfig.color}>
                {conditionConfig.label}
              </Badge>
              <Badge variant="outline" className="border-purple-600 text-purple-400">
                {ORIGIN_LABELS[instance.origin_type] || instance.origin_type}
              </Badge>
            </div>
            {instance.origin_notes && (
              <p className="text-sm text-gray-400">{instance.origin_notes}</p>
            )}
          </div>

          {/* Media */}
          {instance.media?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Photos</p>
              <div className="flex flex-wrap gap-2">
                {instance.media.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="w-20 h-20 object-cover rounded border border-gray-700"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Current Location */}
          <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-blue-400" />
              <span className="text-gray-400">Current Location:</span>
              <span className="text-white">
                {location 
                  ? `${location.location_area}${location.bin_description ? ` - ${location.bin_description}` : ''}`
                  : 'Not assigned'
                }
              </span>
            </div>
          </div>

          {/* Linked Part */}
          {linkedPart && (
            <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-green-400" />
                <span className="text-gray-400">Linked to Part:</span>
                <span className="text-white">{linkedPart.part_name}</span>
              </div>
            </div>
          )}

          {/* Linked Project */}
          {linkedProject && (
            <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-yellow-400" />
                <span className="text-gray-400">Project:</span>
                <span className="text-white">{linkedProject.name}</span>
              </div>
            </div>
          )}

          {/* Linked Inventory */}
          {linkedInventory.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Linked Inventory ({linkedInventory.length})</p>
              <div className="space-y-1">
                {linkedInventory.map(inv => (
                  <div key={inv.id} className="p-2 bg-gray-800/30 rounded text-sm flex items-center justify-between">
                    <span className="text-gray-300">Qty: {inv.quantity_on_hand}</span>
                    <span className="text-gray-500">{inv.source_type || 'Unknown source'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inspection History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">Inspection History ({instanceInspections.length})</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onInspect?.(instance)}
                className="border-gray-700 text-xs"
              >
                <ClipboardCheck className="w-3 h-3 mr-1" />
                New Inspection
              </Button>
            </div>
            {instanceInspections.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {instanceInspections.map(inspection => {
                  const inspector = teamMembers.find(t => t.id === inspection.inspected_by);
                  return (
                    <div key={inspection.id} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Calendar className="w-3 h-3 text-gray-500" />
                          <span className="text-gray-400">
                            {format(new Date(inspection.inspection_date), 'MMM d, yyyy')}
                          </span>
                          {inspector && (
                            <>
                              <User className="w-3 h-3 text-gray-500 ml-2" />
                              <span className="text-gray-400">{inspector.full_name}</span>
                            </>
                          )}
                        </div>
                        <Badge 
                          variant="outline" 
                          className={
                            inspection.inspection_status === 'approved' ? 'border-green-600 text-green-400 text-xs' :
                            inspection.inspection_status === 'completed' ? 'border-blue-600 text-blue-400 text-xs' :
                            'border-gray-600 text-gray-400 text-xs'
                          }
                        >
                          {inspection.inspection_status}
                        </Badge>
                      </div>
                      {inspection.repair_required && (
                        <div className="flex items-center gap-1 text-xs text-red-400 mb-1">
                          <AlertTriangle className="w-3 h-3" />
                          Repair Required
                        </div>
                      )}
                      {inspection.condition_notes && (
                        <p className="text-xs text-gray-400">{inspection.condition_notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                No inspections recorded
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}