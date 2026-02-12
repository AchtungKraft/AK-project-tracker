/**
 * Mobile Form Density Styles
 * Provides compact form styling for mobile devices
 */

// Mobile-optimized input heights
export const MOBILE_INPUT_HEIGHT = 'h-10'; // 40px
export const MOBILE_BUTTON_HEIGHT = 'h-11'; // 44px
export const MOBILE_DROPDOWN_HEIGHT = 'h-10'; // 40px

// Mobile form field class overrides
export const mobileInputClass = 'h-10 text-base'; // 40px height
export const mobileTextareaClass = 'py-2 text-base min-h-[80px]'; // Reduced padding
export const mobileSelectTriggerClass = 'h-10 text-base'; // 40px height
export const mobileButtonClass = 'h-11 text-base'; // 44px height

// Compact mobile spacing for forms
export const mobileFormSpacing = 'space-y-3'; // Tighter than desktop
export const mobileGridGap = 'gap-3'; // Tighter grid gaps

/**
 * Get mobile-optimized class for form inputs
 */
export function getMobileInputClass(isMobile, baseClass = '') {
  return isMobile 
    ? `${baseClass} ${mobileInputClass}` 
    : baseClass;
}

/**
 * Get mobile-optimized class for textareas
 */
export function getMobileTextareaClass(isMobile, baseClass = '') {
  return isMobile 
    ? `${baseClass} ${mobileTextareaClass}` 
    : baseClass;
}

/**
 * Get mobile-optimized class for select triggers
 */
export function getMobileSelectClass(isMobile, baseClass = '') {
  return isMobile 
    ? `${baseClass} ${mobileSelectTriggerClass}` 
    : baseClass;
}

/**
 * Get mobile-optimized class for buttons
 */
export function getMobileButtonClass(isMobile, baseClass = '') {
  return isMobile 
    ? `${baseClass} ${mobileButtonClass}` 
    : baseClass;
}

export default {
  MOBILE_INPUT_HEIGHT,
  MOBILE_BUTTON_HEIGHT,
  MOBILE_DROPDOWN_HEIGHT,
  mobileInputClass,
  mobileTextareaClass,
  mobileSelectTriggerClass,
  mobileButtonClass,
  mobileFormSpacing,
  mobileGridGap,
  getMobileInputClass,
  getMobileTextareaClass,
  getMobileSelectClass,
  getMobileButtonClass,
};