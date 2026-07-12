import React, { useMemo } from "react";
import { RotateCcw, Package, Inbox, Trash2, Truck, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import moment from "moment";
import InventoryLocationEditor from "../InventoryLocationEditor";

const RETURN_CATEGORIES = [
  { key: 'removed',  label: 'Removed Parts',    icon: RotateCcw,       color: '#F97316', 
    filter: (i) => i.source_type === 'vehicle_removed' },
  { key: 'inspect',  label: 'Needs Inspection',  icon: AlertTriangle,   color: '#F59E0B',
    filter: (i) => i.requires_inspection },
  { key: 'damaged',  label: 'Damaged / Scrap',    icon: Trash2,          color: '#EF4444',
    filter: (i) => i.notes?.toLowerCase().includes('damaged') || i.notes?.toLowerCase().includes('scrap') },
];

/**
 * ReturnsQueue — surfaces removed parts, items needing inspection, and damaged inventory.
 * Does not change inventory logic — just exposes existing data in a workflow view.
 */
export default function ReturnsQueue({ locations, inventoryItems, parts, projects, commitments, onNavigateLocation }) {
  const categories = useMemo(() => {
    const partsMap = new Map(parts.map(p => [p.id, p]));
    const locsMap = new Map(locations.map(l => [l.id, l]));
    const activeItems = inventoryItems.filter(i => (i.quantity_on_hand || 0) > 0);

    return RETURN_CATEGORIES.map(cat => {
      const items = activeItems
        .filter(cat.filter)
        .map(item => ({
          ...item,
          part: partsMap.get(item.part_id),
          location: locsMap.get(item.location_id),
        }))
        .filter(i => i.part)
        .sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0));

      return { ...cat, items, totalUnits: items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0) };
    }).filter(cat => cat.items.length > 0);
  }, [inventoryItems, parts, locations]);

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Inbox className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-base font-medium text-gray-400 mb-1">No returns to process</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          Removed parts, items needing inspection, and damaged inventory will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {categories.map(cat => {
        const CatIcon = cat.icon;
        return (
          <div key={cat.key}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <CatIcon className="w-4 h-4" style={{ color: cat.color }} />
              <h4 className="text-sm font-semibold text-gray-300">{cat.label}</h4>
              <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400 ml-auto">
                {cat.items.length} items · {cat.totalUnits} units
              </Badge>
            </div>

            <div className="space-y-2">
              {cat.items.map(item => (
                <div key={item.id} className="flex flex-col gap-2 p-3 bg-gray-900/40 rounded-lg border border-gray-800">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center shrink-0">
                      {item.part.featured_photo ? (
                        <img src={item.part.featured_photo} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <Package className="w-4 h-4 text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-sm text-white truncate">{item.part.part_name}</h5>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                        {item.location && (
                          <span>{item.location.location_area}</span>
                        )}
                        {item.updated_date && (
                          <span>{moment(item.updated_date).fromNow()}</span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-[10px] text-gray-600 mt-1 line-clamp-1 italic">{item.notes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-white">{item.quantity_on_hand}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <InventoryLocationEditor
                      inventoryItemId={item.id}
                      currentLocationId={item.location_id}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}