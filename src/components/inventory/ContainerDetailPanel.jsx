import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, ArrowRightLeft, Printer, Package, MapPin, Plus, Home, Trash2,
  ChevronRight, ChevronDown, CheckCircle2, StickyNote, Pencil, X, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getContainerTypeConfig } from "./containerTypeConfig";
import { printContainerQRLabel } from "./containerQRLabel";
import LocationBreadcrumb from "./LocationBreadcrumb";
import StoragePartRow from "./StoragePartRow";

export default function ContainerDetailPanel({
  container, locations, inventoryItems, parts, projects, vendors,
  onClose, onMove, onReturnHome, onAddParts, onEmptyContainer,
  onPartClick, onOpenGallery, partActions,
  getInventoryStats, getInventoryItemId,
}) {
  const queryClient = useQueryClient();
  const [showMore, setShowMore] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(container.notes || '');
  const [verifying, setVerifying] = useState(false);

  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;
  const location = locations.find(l => l.id === container.location_id);
  const homeLocation = container.home_location_id ? locations.find(l => l.id === container.home_location_id) : null;
  const isAwayFromHome = homeLocation && container.location_id !== container.home_location_id;
  const project = container.project_id ? projects.find(p => p.id === container.project_id) : null;

  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);
  const containedPartIds = new Set(containedItems.map(i => i.part_id));
  const containedParts = parts.filter(p => containedPartIds.has(p.id));
  const totalUnits = containedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const user = await base44.auth.me();
      await base44.entities.StorageContainer.update(container.id, {
        last_verified_at: new Date().toISOString(),
        last_verified_by: user.full_name || user.email || 'Unknown',
      });
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      toast.success('Container verified');
    } catch (e) {
      toast.error('Failed to verify: ' + e.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      await base44.entities.StorageContainer.update(container.id, { notes: notesValue.trim() || null });
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      setEditingNotes(false);
      toast.success('Notes saved');
    } catch (e) {
      toast.error('Failed to save notes: ' + e.message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — what is this + where is it */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-red-900/20 bg-gray-900/40 shrink-0">
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} className="h-9 w-9 text-gray-400 hover:text-white md:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        {container.photo ? (
          <img src={container.photo} alt={container.name} className="w-12 h-12 rounded-lg object-cover border border-gray-700 shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: displayColor + '20' }}>
            <TypeIcon className="w-6 h-6" style={{ color: displayColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white truncate">{container.name}</h3>
          <div className="flex items-center gap-2 text-xs">
            {container.short_code && <span className="font-mono font-bold text-gray-300">{container.short_code}</span>}
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">{containedParts.length} parts · {totalUnits} units</span>
          </div>
          {/* Location — directly in header, no label */}
          <div className="mt-0.5">
            {location ? (
              <LocationBreadcrumb locationId={location.id} locations={locations} compact />
            ) : (
              <span className="text-yellow-400 text-xs">No location</span>
            )}
          </div>
        </div>
      </div>

      {/* Primary actions — the technician's toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-red-900/20 bg-gray-900/10 shrink-0">
        <Button size="sm" variant="outline" onClick={() => onMove(container)} className="gap-1.5 h-9 text-sm border-gray-700 text-gray-300">
          <ArrowRightLeft className="w-4 h-4" /> Move
        </Button>
        {isAwayFromHome && (
          <Button size="sm" variant="outline" onClick={() => onReturnHome?.(container)} className="gap-1.5 h-9 text-sm border-amber-700/50 text-amber-400 hover:bg-amber-950/30">
            <Home className="w-4 h-4" /> Return Home
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={() => printContainerQRLabel(container, { locations })} className="h-9 w-9 text-gray-400 hover:text-white" title="Print Label">
          <Printer className="w-4 h-4" />
        </Button>
        <div className="flex-1" />
        {onAddParts && (
          <Button size="sm" variant="ghost" onClick={() => onAddParts(container)} className="gap-1.5 h-9 text-sm text-gray-400 hover:text-white">
            <Plus className="w-4 h-4" /> Add Parts
          </Button>
        )}
        {containedParts.length > 0 && onEmptyContainer && (
          <Button size="sm" variant="ghost" onClick={() => onEmptyContainer(container)} className="gap-1.5 h-9 text-sm text-gray-500 hover:text-red-400">
            <Trash2 className="w-4 h-4" /> Empty
          </Button>
        )}
      </div>

      {/* Notes callout — only if notes exist, compact */}
      {container.notes && !editingNotes && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-yellow-950/20 border-b border-yellow-900/20 text-xs shrink-0">
          <StickyNote className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <span className="text-yellow-300 flex-1 truncate">{container.notes}</span>
          <Button size="sm" variant="ghost" onClick={() => { setNotesValue(container.notes || ''); setEditingNotes(true); }}
            className="h-6 px-1.5 text-[10px] text-yellow-500 hover:text-yellow-300">
            Edit
          </Button>
        </div>
      )}

      {/* Away from home callout */}
      {isAwayFromHome && homeLocation && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-950/20 border-b border-amber-900/20 text-xs shrink-0">
          <Home className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-amber-300">Away from home · Home: {homeLocation.location_area}</span>
        </div>
      )}

      {/* Contents — the main thing */}
      <div className="flex-1 overflow-y-auto p-4">
        {containedParts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Package className="w-14 h-14 text-gray-700 mb-3" />
            <p className="text-base text-gray-400 font-medium">Empty</p>
            <p className="text-sm text-gray-600 mt-1">No parts in this container</p>
            {onAddParts && (
              <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => onAddParts(container)}>
                <Plus className="w-4 h-4" /> Add Parts
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {containedParts.map(part => {
              const item = containedItems.find(i => i.part_id === part.id);
              return (
                <StoragePartRow key={part.id} part={part}
                  locationQty={item?.quantity_on_hand || 0} locationReserved={item?.quantity_reserved || 0}
                  locationId={container.location_id} selectedLocationId={container.location_id}
                  getInventoryStats={getInventoryStats} getInventoryItemId={getInventoryItemId}
                  vendors={vendors} onPartClick={onPartClick} onOpenGallery={onOpenGallery}
                  partActions={partActions} containerName={container.name} />
              );
            })}
          </div>
        )}

        {/* More details — progressive disclosure at bottom of content */}
        <div className="mt-6 pt-3 border-t border-gray-800">
          <button onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wide">
            {showMore ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            More details
          </button>

          {showMore && (
            <div className="mt-3 space-y-3 pl-1 border-l-2 border-gray-800 ml-1">
              {/* Type + status */}
              <div className="flex items-center gap-2 pl-3 text-xs flex-wrap">
                <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: displayColor + '60', color: displayColor }}>
                  {tc.label}
                </Badge>
                {container.status === 'empty' && (
                  <Badge variant="outline" className="text-[10px] py-0 border-gray-600 text-gray-400">Empty</Badge>
                )}
                {project && (
                  <span className="text-blue-400">
                    <Package className="w-3 h-3 inline mr-1" />{project.name}
                  </span>
                )}
              </div>

              {/* Verified */}
              <div className="flex items-center gap-2 text-xs pl-3">
                <CheckCircle2 className={cn("w-3.5 h-3.5 shrink-0", container.last_verified_at ? "text-green-500" : "text-gray-600")} />
                <span className="text-gray-500">Verified:</span>
                {container.last_verified_at ? (
                  <span className="text-green-400">
                    {new Date(container.last_verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {container.last_verified_by && ` · ${container.last_verified_by}`}
                  </span>
                ) : (
                  <span className="text-gray-600">Never</span>
                )}
                <Button size="sm" variant="ghost" onClick={handleVerify} disabled={verifying}
                  className="h-6 px-2 text-[10px] text-green-500 hover:text-green-400 gap-1 ml-auto">
                  <CheckCircle2 className="w-3 h-3" /> Verify
                </Button>
              </div>

              {/* Notes editing */}
              <div className="flex items-start gap-2 text-xs pl-3">
                <StickyNote className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", container.notes ? "text-yellow-500" : "text-gray-600")} />
                {editingNotes ? (
                  <div className="flex-1 space-y-1.5">
                    <Textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)}
                      placeholder="Customer Supplied, Fragile, Do Not Stack…"
                      className="bg-gray-800 border-gray-700 text-white text-xs min-h-[48px]" rows={2} autoFocus />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={handleSaveNotes} className="h-6 px-2 text-[10px] text-green-500 gap-1">
                        <Check className="w-3 h-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingNotes(false); setNotesValue(container.notes || ''); }} className="h-6 px-2 text-[10px] text-gray-500 gap-1">
                        <X className="w-3 h-3" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className={cn("flex-1", container.notes ? "text-yellow-300" : "text-gray-600")}>
                      {container.notes || 'No notes'}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => { setNotesValue(container.notes || ''); setEditingNotes(true); }}
                      className="h-6 px-2 text-[10px] text-gray-500 hover:text-white gap-1 shrink-0">
                      <Pencil className="w-3 h-3" /> {container.notes ? 'Edit' : 'Add'}
                    </Button>
                  </>
                )}
              </div>

              {/* Description */}
              {container.description && (
                <p className="text-xs text-gray-500 italic pl-3">{container.description}</p>
              )}

              {/* QR value */}
              {container.qr_code_value && (
                <div className="text-[10px] text-gray-500 font-mono bg-gray-800/30 rounded px-3 py-1.5 ml-3">
                  QR: {container.qr_code_value}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}