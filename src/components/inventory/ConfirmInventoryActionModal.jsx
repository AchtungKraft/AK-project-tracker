import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";
import { Package, MapPin, Wrench, ArrowRight, AlertTriangle } from "lucide-react";

/**
 * ConfirmInventoryActionModal
 * Reusable confirmation modal for inventory actions (receive, move, install)
 * Displays part info, quantities, locations, and commitment impact
 */
export default function ConfirmInventoryActionModal({
  isOpen,
  onClose,
  onConfirm,
  actionType = "install", // "receive" | "move" | "install"
  part,
  quantity,
  fromLocation,
  toLocation,
  project,
  task,
  commitment,
  isLoading = false,
  children, // Allow custom content (e.g., location selector)
}) {
  const isMobile = useIsMobile();

  const actionConfig = {
    receive: {
      title: "Confirm Receiving",
      description: "Review the details below before confirming receipt.",
      confirmLabel: "Confirm Receipt",
      icon: Package,
      color: "bg-green-600 hover:bg-green-700",
    },
    move: {
      title: "Confirm Transfer",
      description: "Review the transfer details below.",
      confirmLabel: "Confirm Transfer",
      icon: ArrowRight,
      color: "bg-blue-600 hover:bg-blue-700",
    },
    install: {
      title: "Confirm Installation",
      description: "Review the installation details below.",
      confirmLabel: "Confirm Install",
      icon: Wrench,
      color: "bg-red-600 hover:bg-red-700",
    },
  };

  const config = actionConfig[actionType] || actionConfig.install;
  const Icon = config.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "bg-gray-900 border-gray-700 max-w-md",
          isMobile && "fixed bottom-0 left-0 right-0 top-auto translate-y-0 rounded-t-2xl rounded-b-none max-w-full mx-0"
        )}
        style={isMobile ? { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {config.title}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Custom Content (e.g., location selector) */}
          {children}
          
          {/* Part Info */}
          {part && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="text-white font-medium">{part.part_name}</span>
              </div>
              {part.vendor_part_number && (
                <p className="text-sm text-gray-400 ml-6">SKU: {part.vendor_part_number}</p>
              )}
              {part.part_type && (
                <Badge variant="outline" className="ml-6 text-xs">
                  {part.part_type.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
          )}

          {/* Quantity */}
          <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
            <span className="text-gray-400">Quantity</span>
            <span className="text-white font-bold text-lg">{quantity}</span>
          </div>

          {/* Location Info */}
          {(fromLocation || toLocation) && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
              {fromLocation && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-400">From:</span>
                  <span className="text-white">{fromLocation.name || fromLocation}</span>
                </div>
              )}
              {toLocation && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-400" />
                  <span className="text-gray-400">To:</span>
                  <span className="text-white">{toLocation.name || toLocation}</span>
                </div>
              )}
            </div>
          )}

          {/* Project/Task Info */}
          {(project || task) && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
              {project && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Project:</span>
                  <span className="text-white">{project.name || project}</span>
                </div>
              )}
              {task && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Task:</span>
                  <span className="text-white">{task.name || task}</span>
                </div>
              )}
            </div>
          )}

          {/* Commitment Impact */}
          {commitment && (
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Commitment Impact</span>
              </div>
              <div className="text-sm text-gray-300 space-y-1">
                <p>Committed: {commitment.qty_committed}</p>
                <p>After this action: {commitment.qty_installed + quantity} installed</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className={cn(isMobile && "flex-col-reverse gap-2")}>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className={cn("border-gray-700", isMobile && "w-full h-11")}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(config.color, "text-white", isMobile && "w-full h-11")}
          >
            {isLoading ? "Processing..." : config.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}