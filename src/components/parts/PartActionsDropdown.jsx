import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Package, ShoppingCart, Eye, ExternalLink, Wrench } from "lucide-react";

/**
 * PartActionsDropdown - Quick actions for a part
 * - Add Inventory
 * - Order Part
 * - Add to Build
 * - View Details
 * - Open Order URL
 */
export default function PartActionsDropdown({ 
  part, 
  onAddInventory, 
  onOrderPart,
  onAddToBuild,
  onViewDetails,
  triggerClassName = "",
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`h-8 w-8 text-gray-400 hover:text-white ${triggerClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
        <DropdownMenuItem 
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails?.(part);
          }}
          className="cursor-pointer"
        >
          <Eye className="w-4 h-4 mr-2" />
          View Details
        </DropdownMenuItem>
        
        <DropdownMenuSeparator className="bg-gray-700" />
        
        <DropdownMenuItem 
          onClick={(e) => {
            e.stopPropagation();
            onAddInventory?.(part);
          }}
          className="cursor-pointer text-green-400 focus:text-green-400"
        >
          <Package className="w-4 h-4 mr-2" />
          Add Inventory
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={(e) => {
            e.stopPropagation();
            onOrderPart?.(part);
          }}
          className="cursor-pointer text-blue-400 focus:text-blue-400"
        >
          <ShoppingCart className="w-4 h-4 mr-2" />
          Order Part
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={(e) => {
            e.stopPropagation();
            onAddToBuild?.(part);
          }}
          className="cursor-pointer text-orange-400 focus:text-orange-400"
        >
          <Wrench className="w-4 h-4 mr-2" />
          Add to Build
        </DropdownMenuItem>
        
        {part.order_url && (
          <>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem 
              onClick={(e) => {
                e.stopPropagation();
                window.open(part.order_url, '_blank');
              }}
              className="cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Order URL
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}