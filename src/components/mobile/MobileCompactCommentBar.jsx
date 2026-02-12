import React from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Camera, Send, Loader2 } from 'lucide-react';

/**
 * MobileCompactCommentBar
 * Compact action bar for comment inputs on mobile
 * Replaces large stacked buttons with icon-based controls
 */
export default function MobileCompactCommentBar({
  onAttach,
  onCamera,
  onSend,
  isSending = false,
  disabled = false,
  hasContent = false,
  className = ''
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {onAttach && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAttach}
          disabled={disabled}
          className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <Paperclip className="w-5 h-5" />
        </Button>
      )}
      
      {onCamera && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCamera}
          disabled={disabled}
          className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <Camera className="w-5 h-5" />
        </Button>
      )}
      
      <div className="flex-1" />
      
      <Button
        type="button"
        size="sm"
        onClick={onSend}
        disabled={disabled || isSending || !hasContent}
        className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white"
      >
        {isSending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            Send
          </>
        )}
      </Button>
    </div>
  );
}