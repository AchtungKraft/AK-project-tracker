/**
 * Centralized workspace configuration for PriorityDashboard and ProjectDetail.
 *
 * Both pages are contextual views into the SAME operational system.
 * This module standardizes:
 *  - valid view modes
 *  - localStorage key namespacing
 *  - URL param names
 *  - state precedence (URL > localStorage > default)
 *  - contextual navigation defaults
 */

// ── Valid overview sub-views (inside ProjectDetail "Overview" tab) ──
export const VALID_OVERVIEW_VIEWS = ['card', 'calendar', 'execution', 'shop'];
export const DEFAULT_OVERVIEW_VIEW = 'execution';

// ── Valid PriorityDashboard tabs ──
export const VALID_PRIORITY_TABS = ['card-view', 'calendar-view', 'list-view', 'execution-view', 'shop-view', 'workload-view'];
export const DEFAULT_PRIORITY_TAB = 'shop-view';

// ── Source identifiers for contextual navigation ──
export const SOURCES = {
  PRIORITIES: 'priorities',
  SHOP: 'shop',
  CALENDAR: 'calendar',
  DASHBOARD: 'dashboard',
  CLIENT_PORTAL: 'clientportal',
};

// ── Source → default overview view mapping ──
const SOURCE_VIEW_MAP = {
  [SOURCES.PRIORITIES]: 'execution',
  [SOURCES.SHOP]: 'shop',
  [SOURCES.CALENDAR]: 'calendar',
  [SOURCES.DASHBOARD]: 'card',
  [SOURCES.CLIENT_PORTAL]: 'card',
};

// ── Namespaced localStorage keys ──
export const LS_KEYS = {
  projectOverviewView: (projectId) => `workspace.project.${projectId}.overviewView`,
  priorityTab: 'workspace.priority.tab',
};

// ── Migration: read old keys, write new keys ──
function migrateOldKey(oldKey, newKey) {
  const old = localStorage.getItem(oldKey);
  if (old !== null) {
    localStorage.setItem(newKey, old);
    localStorage.removeItem(oldKey);
    return old;
  }
  return null;
}

/**
 * Resolve the overview sub-view for a project page.
 *
 * Precedence:
 *  1. Explicit URL param `view=`
 *  2. Contextual default from `source=` param
 *  3. Persisted user preference (localStorage)
 *  4. System default (execution)
 *
 * IMPORTANT: This is called ONCE at initialization. After that, local state
 * owns the current session — no reactive effects watching URL.
 */
export function resolveProjectOverviewView(projectId) {
  const params = new URLSearchParams(window.location.search);

  // 1. Explicit URL param
  const urlView = params.get('view');
  if (urlView && VALID_OVERVIEW_VIEWS.includes(urlView)) return urlView;

  // 2. Source-based contextual default
  const source = params.get('source');
  if (source && SOURCE_VIEW_MAP[source]) return SOURCE_VIEW_MAP[source];

  // 3. localStorage (with migration from old key format)
  const newKey = LS_KEYS.projectOverviewView(projectId);
  const oldKey = `project_task_view_mode_${projectId}`;
  const migrated = migrateOldKey(oldKey, newKey);
  const saved = migrated || localStorage.getItem(newKey);
  if (saved && VALID_OVERVIEW_VIEWS.includes(saved)) return saved;

  // 4. System default
  return DEFAULT_OVERVIEW_VIEW;
}

/**
 * Resolve the active tab for PriorityDashboard.
 *
 * Precedence: localStorage > system default.
 * (PriorityDashboard doesn't currently use URL tab params.)
 */
export function resolvePriorityTab() {
  const newKey = LS_KEYS.priorityTab;
  const oldKey = 'priority_view_mode';
  const migrated = migrateOldKey(oldKey, newKey);
  const saved = migrated || localStorage.getItem(newKey);
  if (saved && VALID_PRIORITY_TABS.includes(saved)) return saved;
  return DEFAULT_PRIORITY_TAB;
}

/**
 * Persist the overview sub-view for a project and sync URL.
 */
export function persistProjectOverviewView(projectId, view) {
  localStorage.setItem(LS_KEYS.projectOverviewView(projectId), view);
  syncUrlParam('view', view);
}

/**
 * Persist the priority dashboard tab.
 */
export function persistPriorityTab(tab) {
  localStorage.setItem(LS_KEYS.priorityTab, tab);
}

/**
 * Sync a single URL search param without full navigation.
 * Uses replaceState to avoid polluting browser history.
 */
export function syncUrlParam(key, value) {
  const url = new URL(window.location.href);
  if (value === null || value === undefined) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }
  window.history.replaceState({}, '', url.toString());
}

/**
 * Build a ProjectDetail link with proper contextual params.
 *
 * @param {string} projectId
 * @param {object} opts
 * @param {string} [opts.source] - Where the link originates (e.g. 'priorities', 'shop')
 * @param {string} [opts.view] - Explicit view override (e.g. 'execution', 'shop')
 * @param {string} [opts.tab] - ProjectDetail tab (default: 'overview')
 */
export function buildProjectDetailUrl(projectId, opts = {}) {
  const { source, view, tab } = opts;
  const params = new URLSearchParams();
  params.set('id', projectId);
  if (tab) params.set('tab', tab);
  if (view) params.set('view', view);
  if (source) params.set('source', source);
  return `/projectdetail?${params.toString()}`;
}