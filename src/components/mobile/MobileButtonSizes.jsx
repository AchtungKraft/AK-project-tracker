/**
 * Mobile Button Size Tiers
 * Provides consistent button sizing for mobile devices
 */

// Mobile Primary: Save, Submit, Confirm - main CTAs
export const mobilePrimaryButton = 'h-11 text-[15px] px-3.5'; // 44px
export const mobilePrimaryIcon = 'w-4 h-4'; // 16px

// Mobile Secondary: Cancel, Archive, Delete
export const mobileSecondaryButton = 'h-10 text-sm px-3'; // 40px
export const mobileSecondaryIcon = 'w-4 h-4'; // 16px

// Mobile Inline/Utility: Small actions, toggles
export const mobileInlineButton = 'h-[34px] text-[13px] px-2.5'; // 34px
export const mobileInlineIcon = 'w-3.5 h-3.5'; // 14px

// Mobile Icon Button
export const mobileIconButton = 'h-10 w-10'; // 40px square
export const mobileIconButtonSmall = 'h-8 w-8'; // 32px square

/**
 * Get mobile button classes based on tier
 * @param {boolean} isMobile - Whether device is mobile
 * @param {'primary'|'secondary'|'inline'} tier - Button tier
 * @param {string} baseClass - Additional classes
 */
export function getMobileButtonClass(isMobile, tier = 'primary', baseClass = '') {
  if (!isMobile) return baseClass;
  
  const tierClasses = {
    primary: mobilePrimaryButton,
    secondary: mobileSecondaryButton,
    inline: mobileInlineButton,
  };
  
  return `${baseClass} ${tierClasses[tier] || tierClasses.primary}`;
}

/**
 * Get mobile icon classes based on tier
 * @param {boolean} isMobile - Whether device is mobile
 * @param {'primary'|'secondary'|'inline'} tier - Button tier
 */
export function getMobileIconClass(isMobile, tier = 'primary') {
  if (!isMobile) return 'w-4 h-4';
  
  const tierClasses = {
    primary: mobilePrimaryIcon,
    secondary: mobileSecondaryIcon,
    inline: mobileInlineIcon,
  };
  
  return tierClasses[tier] || tierClasses.primary;
}

export default {
  mobilePrimaryButton,
  mobilePrimaryIcon,
  mobileSecondaryButton,
  mobileSecondaryIcon,
  mobileInlineButton,
  mobileInlineIcon,
  mobileIconButton,
  mobileIconButtonSmall,
  getMobileButtonClass,
  getMobileIconClass,
};