/**
 * TASK STATE EVENTS
 * 
 * Global event system for task state synchronization.
 * Ensures all views react to mutations instantly.
 */

// Event name constant
export const TASK_STATE_UPDATED_EVENT = 'taskStateUpdated';

// Current task version (increments on every mutation)
let taskVersion = 0;

// Mutation timestamps for race condition prevention
const mutationTimestamps = new Map();

/**
 * Get current task version
 */
export function getTaskVersion() {
  return taskVersion;
}

/**
 * Increment task version (call after successful mutation)
 */
export function incrementTaskVersion() {
  taskVersion += 1;
  return taskVersion;
}

/**
 * Emit task state updated event
 * @param {Object} detail - Event details
 */
export function emitTaskStateUpdated(detail = {}) {
  const event = new CustomEvent(TASK_STATE_UPDATED_EVENT, {
    detail: {
      version: taskVersion,
      timestamp: Date.now(),
      ...detail,
    },
  });
  window.dispatchEvent(event);
}

/**
 * Subscribe to task state updates
 * @param {Function} callback - Handler function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTaskStateUpdates(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener(TASK_STATE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(TASK_STATE_UPDATED_EVENT, handler);
}

/**
 * Get mutation timestamp for a task
 * @param {string} taskId 
 */
export function getMutationTimestamp(taskId) {
  return mutationTimestamps.get(taskId) || 0;
}

/**
 * Set mutation timestamp for a task
 * @param {string} taskId 
 * @param {number} timestamp 
 */
export function setMutationTimestamp(taskId, timestamp = Date.now()) {
  mutationTimestamps.set(taskId, timestamp);
  return timestamp;
}

/**
 * Check if incoming mutation is newer than existing
 * Prevents stale mutation overwrites
 * @param {string} taskId 
 * @param {number} incomingTimestamp 
 */
export function shouldApplyMutation(taskId, incomingTimestamp) {
  const existingTimestamp = getMutationTimestamp(taskId);
  return incomingTimestamp >= existingTimestamp;
}

/**
 * Clear mutation timestamp (e.g., on task delete)
 * @param {string} taskId 
 */
export function clearMutationTimestamp(taskId) {
  mutationTimestamps.delete(taskId);
}