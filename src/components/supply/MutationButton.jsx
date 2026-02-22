import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MutationButton - Interaction Stability Layer
 * 
 * Enforces interaction contract:
 * - Disable immediately on click
 * - Show loading indicator inline
 * - Prevent double execution
 * - Re-enable only on success/error
 * - NO optimistic transitions
 * - Always await backend confirmation
 */
export default function MutationButton({
  children,
  onClick,
  onSuccess,
  onError,
  disabled = false,
  variant = "default",
  size = "default",
  className,
  loadingText,
  ...props
}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent double execution
    if (isExecuting || disabled) return;
    
    setIsExecuting(true);
    setError(null);
    
    try {
      // Always await backend confirmation
      const result = await onClick?.(e);
      onSuccess?.(result);
    } catch (err) {
      setError(err.message || 'Action failed');
      onError?.(err);
    } finally {
      // Re-enable only after completion
      setIsExecuting(false);
    }
  }, [onClick, onSuccess, onError, isExecuting, disabled]);

  const isDisabled = disabled || isExecuting;

  return (
    <div className="relative">
      <Button
        variant={variant}
        size={size}
        disabled={isDisabled}
        onClick={handleClick}
        className={cn(
          "transition-all",
          isExecuting && "opacity-80",
          className
        )}
        {...props}
      >
        {isExecuting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </Button>
      
      {/* Inline Error Banner */}
      {error && (
        <div className="absolute top-full left-0 right-0 mt-1 px-2 py-1 bg-red-900/80 border border-red-700 rounded text-xs text-red-200 font-mono">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * useMutationState - Hook for managing mutation state in custom components
 */
export function useMutationState() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (fn) => {
    if (isExecuting) return;
    
    setIsExecuting(true);
    setError(null);
    
    try {
      const result = await fn();
      return result;
    } catch (err) {
      setError(err.message || 'Action failed');
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isExecuting,
    error,
    execute,
    clearError,
    isDisabled: isExecuting
  };
}