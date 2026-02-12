import React, { useRef } from 'react';
import { useIsMobile } from './useIsMobile';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobilePhotoActions
 * Stacked layout on mobile: Take Photo (primary), Upload Photos (secondary)
 * Horizontal layout on desktop.
 */
export default function MobilePhotoActions({ 
  onPhotosSelected,
  onCameraCapture,
  multiple = true,
  accept = 'image/*',
  disabled = false,
  className = ''
}) {
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onPhotosSelected) {
      onPhotosSelected(files);
    }
    // Reset input
    e.target.value = '';
  };

  const handleCameraCapture = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      if (onCameraCapture) {
        onCameraCapture(files[0]);
      } else if (onPhotosSelected) {
        onPhotosSelected(files);
      }
    }
    e.target.value = '';
  };

  // Mobile Layout: Stacked full-width buttons
  if (isMobile) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {/* Primary: Take Photo */}
        <Button
          type="button"
          variant="default"
          className="w-full min-h-[48px] bg-red-600 hover:bg-red-700"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled}
        >
          <Camera className="w-5 h-5 mr-2" />
          Take Photo
        </Button>
        
        {/* Secondary: Upload Photos */}
        <Button
          type="button"
          variant="outline"
          className="w-full min-h-[48px] border-gray-600"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Upload className="w-5 h-5 mr-2" />
          Upload Photos
        </Button>

        {/* Hidden Inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraCapture}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  // Desktop Layout: Horizontal buttons
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        className="border-gray-600"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        <ImageIcon className="w-4 h-4 mr-2" />
        Upload Photos
      </Button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}

/**
 * MobilePhotoGrid - Responsive photo grid display
 */
export function MobilePhotoGrid({ 
  photos = [], 
  onRemove,
  onPhotoClick,
  className = '' 
}) {
  const isMobile = useIsMobile();

  if (!photos.length) return null;

  return (
    <div className={cn(
      'grid gap-2',
      isMobile ? 'grid-cols-3' : 'grid-cols-4 md:grid-cols-6',
      className
    )}>
      {photos.map((photo, index) => (
        <div 
          key={index} 
          className="relative aspect-square bg-gray-800 rounded-lg overflow-hidden group"
        >
          <img 
            src={typeof photo === 'string' ? photo : URL.createObjectURL(photo)} 
            alt="" 
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => onPhotoClick?.(photo, index)}
          />
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              className="absolute top-1 right-1 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center text-white text-sm md:w-6 md:h-6 md:text-xs md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}