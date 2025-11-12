import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ImageModal({ isOpen, onClose, imageUrl }) {
  if (!imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-red-900/30"
        onClick={onClose}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute top-2 right-2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full"
        >
          <X className="w-5 h-5" />
        </Button>
        <div className="flex items-center justify-center w-full h-full p-4">
          <img
            src={imageUrl}
            alt="Expanded view"
            className="max-w-full max-h-full object-contain cursor-pointer"
            onClick={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}