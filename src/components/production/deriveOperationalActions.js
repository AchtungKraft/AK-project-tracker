/**
 * Derive operational management actions from task and project data.
 * Pure function — aggregates counts per action type.
 */

import { Package, Truck, Users, Wrench, ClipboardCheck, AlertTriangle } from "lucide-react";

const ACTION_TYPES = {
  PARTS_TO_ORDER: {
    key: "PARTS_TO_ORDER",
    label: "Parts to Order",
    icon: Package,
    color: "text-orange-400",
    bgClass: "bg-orange-900/15",
    borderClass: "border-orange-800/30",
  },
  VENDOR_FOLLOWUP: {
    key: "VENDOR_FOLLOWUP",
    label: "Vendor Follow-up",
    icon: Truck,
    color: "text-purple-400",
    bgClass: "bg-purple-900/15",
    borderClass: "border-purple-800/30",
  },
  CUSTOMER_DECISIONS: {
    key: "CUSTOMER_DECISIONS",
    label: "Customer Decisions",
    icon: Users,
    color: "text-blue-400",
    bgClass: "bg-blue-900/15",
    borderClass: "border-blue-800/30",
  },
  ENGINEERING_REVIEW: {
    key: "ENGINEERING_REVIEW",
    label: "Review Required",
    icon: ClipboardCheck,
    color: "text-violet-400",
    bgClass: "bg-violet-900/15",
    borderClass: "border-violet-800/30",
  },
  SHOP_ACTION: {
    key: "SHOP_ACTION",
    label: "Shop Action",
    icon: Wrench,
    color: "text-red-400",
    bgClass: "bg-red-900/15",
    borderClass: "border-red-800/30",
  },
};

export function deriveOperationalActions(tasks) {
  const actions = [];
  const counts = {
    PARTS_TO_ORDER: 0,
    VENDOR_FOLLOWUP: 0,
    CUSTOMER_DECISIONS: 0,
    ENGINEERING_REVIEW: 0,
    SHOP_ACTION: 0,
  };

  const tasksByAction = {
    PARTS_TO_ORDER: [],
    VENDOR_FOLLOWUP: [],
    CUSTOMER_DECISIONS: [],
    ENGINEERING_REVIEW: [],
    SHOP_ACTION: [],
  };

  tasks.forEach(t => {
    const os = t.operational_state;
    const reasons = t.blocking_reasons || [];

    if (os === "WAITING_ON_PARTS") {
      counts.PARTS_TO_ORDER++;
      tasksByAction.PARTS_TO_ORDER.push(t);
    }
    if (os === "WAITING_ON_VENDOR") {
      counts.VENDOR_FOLLOWUP++;
      tasksByAction.VENDOR_FOLLOWUP.push(t);
    }
    if (os === "WAITING_ON_CUSTOMER") {
      counts.CUSTOMER_DECISIONS++;
      tasksByAction.CUSTOMER_DECISIONS.push(t);
    }
    if (os === "REVIEW_REQUIRED") {
      counts.ENGINEERING_REVIEW++;
      tasksByAction.ENGINEERING_REVIEW.push(t);
    }
    if (os === "BLOCKED") {
      // Blocked tasks that aren't waiting on externals need shop action
      const isExternalBlock = reasons.some(r =>
        ["PART", "PURCHASE_ORDER", "VENDOR", "CUSTOMER_APPROVAL"].includes(r.type)
      );
      if (!isExternalBlock) {
        counts.SHOP_ACTION++;
        tasksByAction.SHOP_ACTION.push(t);
      }
    }
  });

  // Only include actions with counts > 0
  Object.entries(counts).forEach(([key, count]) => {
    if (count > 0) {
      actions.push({
        ...ACTION_TYPES[key],
        count,
        tasks: tasksByAction[key],
      });
    }
  });

  return actions;
}

export { ACTION_TYPES };