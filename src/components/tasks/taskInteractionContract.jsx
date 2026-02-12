/**
 * TASK INTERACTION CONTRACT
 * 
 * This file defines the enforcement rules for task UI consistency.
 * 
 * RULES:
 * 1. No component may call base44.entities.Task.update() directly
 * 2. All mutations must route through useTaskInteraction hook
 * 3. TaskCard must be PRESENTATIONAL ONLY
 * 4. All task modals/drawers MUST use TaskActionFooter
 * 5. All inline controls MUST use TaskInlineControlBar
 * 6. All grouping MUST use useTaskGrouping
 */

// Development mode assertions
const isDev = process.env.NODE_ENV === 'development';

/**
 * Assert that TaskCard is not receiving mutation handlers directly
 * Call this in TaskCard during development
 */
export function assertPresentationalTaskCard(props) {
  if (!isDev) return;
  
  const mutationProps = ['onUpdate', 'onDelete', 'queryClient'];
  const violations = mutationProps.filter(prop => prop in props);
  
  if (violations.length > 0) {
    console.warn(
      `[TASK CONTRACT VIOLATION] TaskCard received mutation props: ${violations.join(', ')}. ` +
      'TaskCard should be PRESENTATIONAL ONLY. Use TaskInlineControlBar for inline controls.'
    );
  }
}

/**
 * Assert that a task modal/drawer includes TaskActionFooter
 * Call this in development to validate component structure
 */
export function assertHasActionFooter(componentName, hasFooter) {
  if (!isDev) return;
  
  if (!hasFooter) {
    console.warn(
      `[TASK CONTRACT VIOLATION] ${componentName} does not include TaskActionFooter. ` +
      'All task modals and drawers MUST use TaskActionFooter for consistent UX.'
    );
  }
}

/**
 * Assert that calendar/kanban views use useTaskGrouping
 * Call this in development
 */
export function assertUsesTaskGrouping(componentName, usesGrouping) {
  if (!isDev) return;
  
  if (!usesGrouping) {
    console.warn(
      `[TASK CONTRACT VIOLATION] ${componentName} does not use useTaskGrouping. ` +
      'Calendar + Kanban + Priority Dashboard must ALL use useTaskGrouping hook.'
    );
  }
}

/**
 * Accessibility constants
 */
export const ACCESSIBILITY = {
  MIN_TOUCH_TARGET: 44, // px - WCAG 2.1 Success Criterion 2.5.5
  MIN_CONTRAST_RATIO: 4.5, // WCAG AA for normal text
};

/**
 * Cache key registry - single source of truth
 */
export const TASK_CACHE_KEYS = [
  ['tasks'],
  ['projectTasks'],
  ['priorityTasks'],
  ['allTasksForCalendar'],
  ['task'],
];

/**
 * Task interaction contract summary
 */
export const CONTRACT_SUMMARY = `
TASK INTERACTION CONTRACT v1.0

ALLOWED:
✓ useTaskInteraction() for all mutations
✓ TaskActionFooter in all modals/drawers
✓ TaskInlineControlBar for inline controls
✓ useTaskGrouping for calendar/kanban views
✓ Minimum 44px touch targets

FORBIDDEN:
✗ Direct base44.entities.Task.update() calls in components
✗ Mutation logic inside TaskCard
✗ Custom footer implementations
✗ Custom inline control implementations
✗ Manual grouping logic outside useTaskGrouping
`;

export default {
  assertPresentationalTaskCard,
  assertHasActionFooter,
  assertUsesTaskGrouping,
  ACCESSIBILITY,
  TASK_CACHE_KEYS,
  CONTRACT_SUMMARY,
};