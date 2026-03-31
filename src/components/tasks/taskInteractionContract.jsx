/**
 * TASK INTERACTION CONTRACT v2.0
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
 * 7. Calendar views MUST exclude tasks without start_date AND due_date
 * 8. All mutations MUST include timestamp for race condition prevention
 * 
 * STATE INTEGRITY RULES:
 * - normalizeTask() must be applied after fetch and before cache write
 * - emitTaskStateUpdated() must be called after successful mutation
 * - useTaskGrouping must subscribe to state events for instant reflow
 */

// Development mode assertions
const isDev = import.meta.env.DEV;

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
 * Assert that inline controls route through useTaskInteraction
 * Call this in development when inline controls are used
 */
export function assertUsesTaskInteraction(componentName, usesInteraction) {
  if (!isDev) return;
  
  if (!usesInteraction) {
    console.warn(
      `[TASK CONTRACT VIOLATION] ${componentName} bypasses useTaskInteraction. ` +
      'All inline controls must route through useTaskInteraction or useTaskData.'
    );
  }
}

/**
 * Assert that direct entity updates are not used
 * Call this to detect direct base44.entities.Task.update() calls
 */
export function assertNoDirectEntityUpdate(componentName, hasDirectUpdate) {
  if (!isDev) return;
  
  if (hasDirectUpdate) {
    console.warn(
      `[TASK CONTRACT VIOLATION] ${componentName} uses direct entity update. ` +
      'All task mutations MUST route through useTaskInteraction hook.'
    );
  }
}

/**
 * Assert calendar excludes tasks without dates
 * Call this in calendar views to verify date filtering
 */
export function assertCalendarDateFiltering(componentName, tasksWithoutDates) {
  if (!isDev) return;
  
  if (tasksWithoutDates > 0) {
    console.warn(
      `[TASK CONTRACT VIOLATION] ${componentName} includes ${tasksWithoutDates} tasks without dates. ` +
      'Calendar views MUST exclude tasks without start_date AND due_date.'
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
TASK INTERACTION CONTRACT v2.0

STATE INTEGRITY:
✓ normalizeTask() after fetch and before cache write
✓ emitTaskStateUpdated() after successful mutation
✓ Mutation timestamps for race condition prevention
✓ useTaskGrouping subscribes to state events

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
✗ Tasks without dates in calendar views
`;

export default {
  assertPresentationalTaskCard,
  assertHasActionFooter,
  assertUsesTaskGrouping,
  assertUsesTaskInteraction,
  assertNoDirectEntityUpdate,
  assertCalendarDateFiltering,
  ACCESSIBILITY,
  TASK_CACHE_KEYS,
  CONTRACT_SUMMARY,
};