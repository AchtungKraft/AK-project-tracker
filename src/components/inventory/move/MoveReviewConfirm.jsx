import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, Package, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig, buildLocationPathString } from "../locationTypeConfig";
import { getContainerTypeConfig } from "../containerTypeConfig";

/**
 * MoveReviewConfirm — review & confirm the batch transfer.
 *
 * Props:
 *   source        — { type, id, entity, location_id }
 *   destination   — { type, id, entity, location_id }
 *   moveLines     — [{ inventoryItem, part, qty }]
 *   locations, projects
 *   isExecuting
 *   onConfirm, onChangeDestination, onBack, onCancel
 */
export default function MoveReviewConfirm({
  source, destination, moveLines, locations, projects,
  isExecuting, onConfirm, onChangeDestination, onBack, onCancel,
}) {
  const totalLines = moveLines.length;
  const totalPieces = moveLines.reduce((s, l) => s + l.qty, 0);

  const renderEntity = (label, entity, type, locationId, color) => {
    const isContainer = type === 'CONTAINER';
    const loc = locations.find(l => l.id === locationId);
    const proj = entity.project_id ? projects?.find(p => p.id === entity.project_id) : null;

    let icon, name, code;
    if (isContainer) {
      const ctc = getContainerTypeConfig(entity.container_type);
      icon = <ctc.icon className="w-6 h-6" style={{ color: entity.color || ctc.color }} />;
      name = entity.name;
      code = entity.short_code;
    } else {
      const ltc = getLocationTypeConfig(entity.location_type);
      icon = <ltc.icon className="w-6 h-6" style={{ color: entity.color || ltc.color }} />;
      name = entity.location_area;
      code = entity.short_code;
    }

    return (
      <div className={cn("rounded-lg border p-3", color)}>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">{label}</div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-800/50 flex items-center justify-center shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm truncate">{name}</span>
              {code && <span className="text-xs font-mono text-gray-400">{code}</span>}
            </div>
            {loc && (
              <div className="text-xs text-gray-500 truncate">{buildLocationPathString(locationId, locations)}</div>
            )}
            {proj && (
              <div className="text-xs text-blue-400 mt-0.5">
                <Package className="w-3 h-3 inline mr-1" />{proj.name}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 shrink-0">
        <h2 className="text-lg font-bold text-white">Review Move</h2>
        <p className="text-xs text-gray-500">Confirm the transfer details below</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* FROM */}
        {renderEntity('From', source.entity, source.type, source.location_id, 'border-gray-700 bg-gray-900/30')}

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="w-10 h-10 rounded-full bg-red-950/50 flex items-center justify-center">
            <ArrowDown className="w-5 h-5 text-red-400" />
          </div>
        </div>

        {/* TO */}
        {renderEntity('To', destination.entity, destination.type, destination.location_id, 'border-red-800/50 bg-red-950/10')}

        {/* Items */}
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-900/50 border-b border-gray-700 flex items-center justify-between">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Items</span>
            <span className="text-xs text-gray-400">{totalLines} lines · {totalPieces} pieces</span>
          </div>
          <div className="divide-y divide-gray-800">
            {moveLines.map((line, idx) => {
              const photo = line.part?.featured_photo || line.part?.photos?.[0];
              return (
                <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                  {photo ? (
                    <img src={photo} alt="" className="w-8 h-8 rounded object-cover border border-gray-700 shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{line.part?.part_name || 'Unknown'}</div>
                    {line.part?.vendor_part_number && (
                      <div className="text-xs text-gray-500 font-mono">{line.part.vendor_part_number}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-white font-bold text-sm">{line.qty}</span>
                    <span className="text-gray-500 text-xs ml-1">
                      of {(line.inventoryItem.quantity_on_hand || 0) - (line.inventoryItem.quantity_reserved || 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/80 backdrop-blur shrink-0 space-y-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <Button
          onClick={onConfirm}
          disabled={isExecuting}
          className="w-full h-14 text-lg gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900/50"
        >
          {isExecuting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Moving…</>
          ) : (
            <>Confirm Move · {totalPieces} pieces</>
          )}
        </Button>
        <div className="flex gap-2">
          <Button onClick={onChangeDestination} variant="outline" disabled={isExecuting}
            className="flex-1 h-10 border-gray-700 text-gray-300 text-sm">
            Change Destination
          </Button>
          <Button onClick={onBack} variant="ghost" disabled={isExecuting}
            className="h-10 text-gray-500 text-sm">
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}