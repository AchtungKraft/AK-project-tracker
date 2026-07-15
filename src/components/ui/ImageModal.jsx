import React, { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ImageModal({ isOpen, onClose, imageUrl, images = [], currentIndex = 0, onNavigate }) {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const hasImages = images && images.length > 0;
  const hasMultipleImages = images && images.length > 1;
  const activeIndex = hasImages ? currentIndex : 0;
  const displayUrl = hasImages ? images[activeIndex] : imageUrl;

  // Reset load state when image changes
  useEffect(() => {
    setImgLoading(true);
    setImgError(false);
  }, [displayUrl]);

  const handlePrev = useCallback((e) => {
    e?.stopPropagation();
    if (hasMultipleImages && onNavigate) {
      const newIndex = activeIndex === 0 ? images.length - 1 : activeIndex - 1;
      onNavigate(newIndex);
    }
  }, [hasMultipleImages, onNavigate, activeIndex, images?.length]);

  const handleNext = useCallback((e) => {
    e?.stopPropagation();
    if (hasMultipleImages && onNavigate) {
      const newIndex = activeIndex === images.length - 1 ? 0 : activeIndex + 1;
      onNavigate(newIndex);
    }
  }, [hasMultipleImages, onNavigate, activeIndex, images?.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || !hasMultipleImages) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasMultipleImages, handlePrev, handleNext, onClose]);

  // Swipe handling
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && hasMultipleImages) {
      handleNext();
    }
    if (isRightSwipe && hasMultipleImages) {
      handlePrev();
    }
  };

  if (!displayUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-red-900/30"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute top-2 right-2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full"
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Navigation Arrows */}
        {hasMultipleImages && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </>
        )}

        <div 
          className="flex items-center justify-center w-full h-full p-4 min-h-[40vh]"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {imgError ? (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <ImageOff className="w-10 h-10" />
              <p className="text-sm">Image could not be loaded</p>
            </div>
          ) : (
            <>
              {imgLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                </div>
              )}
              <img
                src={displayUrl}
                alt={`Image ${activeIndex + 1}${hasMultipleImages ? ` of ${images.length}` : ''}`}
                className={`max-w-full max-h-[85vh] object-contain transition-opacity ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => setImgLoading(false)}
                onError={() => { setImgLoading(false); setImgError(true); }}
              />
            </>
          )}
        </div>

        {/* Image Counter */}
        {hasImages && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full text-white text-sm">
            {activeIndex + 1} / {images.length}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}