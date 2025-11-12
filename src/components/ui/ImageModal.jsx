import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ImageModal({ isOpen, onClose, imageUrl }) {
  if (!imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-red-900/30">
        <div className="relative w-full h-full flex items-center justify-center p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-4 right-4 z-50 text-white hover:bg-red-600/20 bg-black/50"
          >
            <X className="w-6 h-6" />
          </Button>
          
          <img
            src={imageUrl}
            alt="Enlarged view"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}