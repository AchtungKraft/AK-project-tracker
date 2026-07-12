import React, { useMemo } from "react";
import { ShoppingCart, Package, Wrench, User, MapPin, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "../locationTypeConfig";
import moment from "moment";

const CART_TYPES = ['cart', 'engine_cart', 'body_cart', 'tech_cart'];

/**
 * TechnicianCartsView — shows all tech carts with their current inventory.
 * Answers: "What's on my cart?"
 */
export default function TechnicianCartsView({ locations, inventoryItems, parts, projects, commitments, teamMembers = [], onNavigateLocation }) {
  const carts = useMemo(() => {
    const cartLocs = locations
      .filter(l => CART_TYPES.includes(l.location_type) && l.active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const partsMap = new Map(parts.map(p => [p.id, p]));

    return cartLocs.map(loc => {
      const items = inventoryItems.filter(i => i.location_id === loc.id && (i.quantity_on_hand || 0) > 0);
      const partCount = new Set(items.map(i => i.part_id)).size;
      const totalUnits = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
      const reservedUnits = items.reduce((s, i) => s + (i.quantity_reserved || 0), 0);
      const tc = getLocationTypeConfig(loc.location_type);

      // Find associated project
      const project = loc.project_id ? projects.find(p => p.id === loc.project_id) : null;

      // Get top 3 parts on this cart
      const topParts = items
        .sort((a, b) => (b.quantity_on_hand || 0) - (a.quantity_on_hand || 0))
        .slice(0, 3)
        .map(i => partsMap.get(i.part_id))
        .filter(Boolean);

      // Last activity
      const latestItem = items.sort((a, b) => 
        new Date(b.updated_date || 0) - new Date(a.updated_date || 0)
      )[0];

      return {
        loc,
        tc,
        partCount,
        totalUnits,
        reservedUnits,
        project,
        topParts,
        lastActivity: latestItem?.updated_date,
        isEmpty: partCount === 0,
      };
    });
  }, [locations, inventoryItems, parts, projects]);

  if (carts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <ShoppingCart className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-base font-medium text-gray-400 mb-1">No carts configured</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          Set up technician carts in Admin → Storage Locations to track mobile inventory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-sm font-semibold text-gray-300">
          {carts.length} cart{carts.length !== 1 ? 's' : ''}
          {' · '}
          <span className="text-gray-500 font-normal">
            {carts.filter(c => !c.isEmpty).length} with inventory
          </span>
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {carts.map(cart => {
          const TypeIcon = cart.tc.icon;
          return (
            <button
              key={cart.loc.id}
              onClick={() => onNavigateLocation?.(cart.loc.id)}
              className={cn(
                "flex flex-col gap-3 p-4 rounded-xl border transition-all text-left group",
                cart.isEmpty
                  ? "border-gray-800/50 bg-gray-900/20 hover:border-gray-700"
                  : "border-gray-700 bg-gray-900/40 hover:border-gray-600"
              )}
            >
              {/* Cart Header */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: (cart.loc.color || cart.tc.color) + '20' }}
                >
                  <TypeIcon className="w-5 h-5" style={{ color: cart.loc.color || cart.tc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white truncate">{cart.loc.location_area}</h4>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {cart.loc.short_code && (
                      <span className="text-[10px] font-mono text-gray-500">[{cart.loc.short_code}]</span>
                    )}
                    {cart.project && (
                      <Badge variant="outline" className="text-[10px] border-purple-700/50 text-purple-400 px-1.5 py-0">
                        {cart.project.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn("text-lg font-bold", cart.isEmpty ? "text-gray-600" : "text-white")}>
                    {cart.partCount}
                  </div>
                  <div className="text-[10px] text-gray-500">parts</div>
                </div>
              </div>

              {/* Stats */}
              {!cart.isEmpty && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-400">
                    <span className="text-white font-medium">{cart.totalUnits}</span> units
                  </span>
                  {cart.reservedUnits > 0 && (
                    <span className="text-orange-400">
                      {cart.reservedUnits} reserved
                    </span>
                  )}
                  {cart.lastActivity && (
                    <span className="text-gray-600 ml-auto">
                      {moment(cart.lastActivity).fromNow()}
                    </span>
                  )}
                </div>
              )}

              {/* Top Parts Preview */}
              {cart.topParts.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-gray-800 pt-2">
                  {cart.topParts.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <Package className="w-3 h-3 text-gray-600 shrink-0" />
                      <span className="text-gray-400 truncate">{p.part_name}</span>
                    </div>
                  ))}
                  {cart.partCount > 3 && (
                    <span className="text-[10px] text-gray-600">+{cart.partCount - 3} more</span>
                  )}
                </div>
              )}

              {cart.isEmpty && (
                <div className="text-xs text-gray-600">Empty — no parts on this cart</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}