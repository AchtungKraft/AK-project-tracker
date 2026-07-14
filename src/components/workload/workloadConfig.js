/**
 * Workload View Configuration — operational state sections, labels, icons.
 * Single source of truth for section ordering and display.
 */

// Section definitions ordered by operational priority
export const WORKLOAD_SECTIONS = [
  {
    key: "IN_PROGRESS",
    title: "In Progress",
    icon: "Play",
    color: "#F59E0B",
    borderColor: "border-amber-600/50",
    headerBg: "bg-amber-600/10",
    textColor: "text-amber-400",
    defaultExpanded: true,
  },
  {
    key: "READY",
    title: "Ready to Start",
    icon: "CircleCheck",
    color: "#22C55E",
    borderColor: "border-green-600/50",
    headerBg: "bg-green-600/10",
    textColor: "text-green-400",
    defaultExpanded: true,
  },
  {
    key: "BLOCKED",
    title: "Blocked",
    icon: "Ban",
    color: "#EF4444",
    borderColor: "border-red-600/50",
    headerBg: "bg-red-600/10",
    textColor: "text-red-400",
    defaultExpanded: true,
  },
  {
    key: "WAITING_ON_PARTS",
    title: "Waiting on Parts",
    icon: "Package",
    color: "#F97316",
    borderColor: "border-orange-600/50",
    headerBg: "bg-orange-600/10",
    textColor: "text-orange-400",
    defaultExpanded: true,
  },
  {
    key: "WAITING_ON_VENDOR",
    title: "Waiting on Vendor",
    icon: "Truck",
    color: "#8B5CF6",
    borderColor: "border-purple-600/50",
    headerBg: "bg-purple-600/10",
    textColor: "text-purple-400",
    defaultExpanded: true,
  },
  {
    key: "WAITING_ON_CUSTOMER",
    title: "Waiting on Customer",
    icon: "UserCheck",
    color: "#3B82F6",
    borderColor: "border-blue-600/50",
    headerBg: "bg-blue-600/10",
    textColor: "text-blue-400",
    defaultExpanded: true,
  },
  {
    key: "REVIEW_REQUIRED",
    title: "Review Required",
    icon: "Eye",
    color: "#A855F7",
    borderColor: "border-violet-600/50",
    headerBg: "bg-violet-600/10",
    textColor: "text-violet-400",
    defaultExpanded: true,
  },
  {
    key: "NOT_STARTED",
    title: "Not Scheduled",
    icon: "Circle",
    color: "#6B7280",
    borderColor: "border-gray-600/50",
    headerBg: "bg-gray-600/10",
    textColor: "text-gray-400",
    defaultExpanded: false,
  },
  {
    key: "COMPLETED",
    title: "Recently Completed",
    icon: "CheckCircle2",
    color: "#10B981",
    borderColor: "border-emerald-600/50",
    headerBg: "bg-emerald-600/10",
    textColor: "text-emerald-400",
    defaultExpanded: false,
  },
];

// Date filter options
export const DATE_FILTERS = [
  { key: "all", label: "All Dates" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due Today" },
  { key: "this_week", label: "Due This Week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "unscheduled", label: "Unscheduled" },
];

// Completed time window options
export const COMPLETED_WINDOWS = [
  { key: "24h", label: "Last 24 Hours", hours: 24 },
  { key: "7d", label: "Last 7 Days", hours: 168 },
  { key: "30d", label: "Last 30 Days", hours: 720 },
];

// Blocking reason type display labels
export const BLOCKER_TYPE_LABELS = {
  DEPENDENCY: "Dependency",
  PART: "Part",
  PURCHASE_ORDER: "PO",
  VENDOR: "Vendor",
  CUSTOMER_APPROVAL: "Customer",
  INTERNAL_REVIEW: "Review",
  PHASE: "Phase",
  ASSIGNMENT: "Assignment",
  MANUAL_HOLD: "Hold",
  DATA_CONFIGURATION: "Config",
};