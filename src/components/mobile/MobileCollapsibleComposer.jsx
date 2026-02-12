import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronUp, Send, Upload, Paperclip, Link as LinkIcon, Loader2, X, Plus } from 'lucide-react';
import { useIsMobile } from './useIsMobile';
import { cn } from '@/lib/utils';

/**
 * MobileCollapsibleComposer
 * Collapsible comment composer that saves vertical space on mobile
 * Expands when tapped, collapses to single row when empty
 */
export default function MobileCollapsibleComposer({
  value,
  onChange,
  onSubmit,
  placeholder = 'Add a comment...',
  isSubmitting = false,
  disabled = false,
  // Attachment handlers
  onImageUpload,
  onFileUpload,
  uploadingImages = false,
  uploadingFiles = false,
  uploadedPhotos = [],
  uploadedFiles = [],
  onRemovePhoto,
  onRemoveFile,
  // Links
  links = [''],
  onLinksChange,
  showLinks = true,
  // Visibility selector
  visibilitySelector,
  // Additional actions
  additionalActions,
  className = '',
}) {
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const hasContent = value?.trim() || uploadedPhotos.length > 0 || uploadedFiles.length > 0 || links.some(l => l.trim());
  
  // Auto-expand when there's content
  const shouldExpand = isExpanded || hasContent;

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleCollapse = () => {
    if (!hasContent) {
      setIsExpanded(false);
    }
  };

  // Desktop: render standard layout
  if (!isMobile) {
    return (
      <div className={cn('space-y-3', className)}>
        {visibilitySelector && (
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Add Comment</h3>
            {visibilitySelector}
          </div>
        )}
        
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
        />

        {/* Photos preview */}
        {uploadedPhotos.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {uploadedPhotos.map((url, idx) => (
              <div key={idx} className="relative group">
                <div className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <img src={url} alt="" className="w-full h-full object-contain" />
                </div>
                {onRemovePhoto && (
                  <button
                    type="button"
                    onClick={() => onRemovePhoto(url)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Files preview */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            {uploadedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
                <span className="text-white text-sm truncate">{file.name}</span>
                {onRemoveFile && (
                  <button type="button" onClick={() => onRemoveFile(file.url)} className="text-red-400 p-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Links */}
        {showLinks && onLinksChange && (
          <div className="space-y-2">
            {links.map((link, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={link}
                  onChange={(e) => {
                    const updated = [...links];
                    updated[idx] = e.target.value;
                    onLinksChange(updated);
                  }}
                  placeholder="https://..."
                  className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
                />
                {idx === links.length - 1 && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onLinksChange([...links, ''])}
                    className="border-gray-700"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onImageUpload && (
            <>
              <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingImages}
                onClick={() => imageInputRef.current?.click()}
                className="border-gray-700"
              >
                {uploadingImages ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                Add Images
              </Button>
            </>
          )}
          
          {onFileUpload && (
            <>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={onFileUpload} className="hidden" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingFiles}
                onClick={() => fileInputRef.current?.click()}
                className="border-gray-700"
              >
                {uploadingFiles ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Paperclip className="w-4 h-4 mr-1" />}
                Attach File
              </Button>
            </>
          )}

          {additionalActions}

          <Button
            onClick={onSubmit}
            disabled={isSubmitting || disabled}
            className="bg-blue-600 hover:bg-blue-700 text-white ml-auto"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Send
          </Button>
        </div>
      </div>
    );
  }

  // Mobile: collapsible layout
  return (
    <div className={cn('bg-black/40 backdrop-blur-xl border border-gray-700 rounded-lg overflow-hidden', className)}>
      {/* Collapsed header / expand trigger */}
      <button
        type="button"
        onClick={() => setIsExpanded(!shouldExpand)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="font-medium text-white text-sm">Add Comment</span>
        <div className="flex items-center gap-2">
          {visibilitySelector}
          {shouldExpand ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {shouldExpand && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700/50">
          {/* Textarea - reduced height */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={handleFocus}
            onBlur={handleCollapse}
            className="bg-gray-800 border-gray-700 text-white min-h-[80px] mt-2 py-2 text-sm"
          />

          {/* Compact attachment previews */}
          {(uploadedPhotos.length > 0 || uploadedFiles.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {uploadedPhotos.map((url, idx) => (
                <div key={idx} className="relative w-14 h-14 rounded overflow-hidden border border-gray-700">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {onRemovePhoto && (
                    <button
                      type="button"
                      onClick={() => onRemovePhoto(url)}
                      className="absolute top-0 right-0 bg-red-600 text-white p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1 text-xs text-gray-300">
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate max-w-20">{file.name}</span>
                  {onRemoveFile && (
                    <button type="button" onClick={() => onRemoveFile(file.url)} className="text-red-400 ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compact action toolbar */}
          <div className="flex items-center gap-1.5 pt-1">
            {/* Icon buttons for attachments */}
            {onImageUpload && (
              <>
                <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingImages}
                  onClick={() => imageInputRef.current?.click()}
                  className="h-9 w-9 p-0 text-gray-400 hover:text-white"
                >
                  {uploadingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
              </>
            )}
            
            {onFileUpload && (
              <>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={onFileUpload} className="hidden" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingFiles}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 w-9 p-0 text-gray-400 hover:text-white"
                >
                  {uploadingFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </Button>
              </>
            )}

            {showLinks && onLinksChange && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onLinksChange([...links, ''])}
                className="h-9 w-9 p-0 text-gray-400 hover:text-white"
              >
                <LinkIcon className="w-4 h-4" />
              </Button>
            )}

            {/* Attachment count indicator */}
            {(uploadedPhotos.length > 0 || uploadedFiles.length > 0) && (
              <span className="text-xs text-gray-500 ml-1">
                {uploadedPhotos.length + uploadedFiles.length} attached
              </span>
            )}

            <div className="flex-1" />

            {/* Primary send button */}
            <Button
              onClick={onSubmit}
              disabled={isSubmitting || disabled || !hasContent}
              size="sm"
              className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              Send
            </Button>
          </div>

          {/* Links input - only show if there are links */}
          {showLinks && onLinksChange && links.some(l => l.trim()) && (
            <div className="space-y-1.5 pt-1">
              {links.map((link, idx) => (
                <div key={idx} className="flex gap-1.5">
                  <input
                    value={link}
                    onChange={(e) => {
                      const updated = [...links];
                      updated[idx] = e.target.value;
                      onLinksChange(updated);
                    }}
                    placeholder="https://..."
                    className="flex-1 bg-gray-800 border border-gray-700 text-white rounded px-2 py-1.5 text-sm"
                  />
                  {links.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onLinksChange(links.filter((_, i) => i !== idx))}
                      className="h-8 w-8 p-0 text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}