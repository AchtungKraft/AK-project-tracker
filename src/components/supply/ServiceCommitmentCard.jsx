import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ArrowRight, Trash2, ChevronDown, ChevronRight, List, Pencil } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import ServiceLineItemManager from "@/components/supply/ServiceLineItemManager";
import EditServiceModal from "@/components/supply/EditServiceModal";
import DeleteServiceConfirmModal from "@/components/supply/DeleteServiceConfirmModal";
import ServiceCostBadge from "@/components/supply/ServiceCostBadge";
import { FolderKanban } from "lucide-react";

const STATUS_CONFIG = {
  planned: { label: "Planned", color: "bg-gray-800/80 text-gray-400 border border-gray-700/50" },
  ordered: { label: "Ordered", color: "bg-blue-900/50 text-blue-400 border border-blue-700/50" },
  completed: { label: "Completed", color: "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50" },
  billed: { label: "Billed", color: "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50" },
};

const NEXT_STATUS = {
  planned: "ordered",
  ordered: "completed",
  completed: "billed",
};

const NEXT_LABEL = {
  planned: "Mark Ordered",
  ordered: "Mark Completed",
  completed: "Mark Billed",
};

/**
 * ServiceCommitmentCard — Renders a single enriched service commitment.
 *
 * Accepts pre-enriched data from getServicesView read model.
 * Falls back to legacy prop-based names for backward compatibility.
 *
 * Props:
 *  - commitment: enriched commitment from getServicesView (has service_name, vendor_name, project_name, total_cost, margin_pct)
 *  - serviceName?: string (legacy — used if commitment.service_name missing)
 *  - vendorName?: string (legacy)
 *  - projectName?: string (legacy)
 *  - onStatusChange, onDelete, onTotalsChanged
 */
export default function ServiceCommitmentCard({
  commitment,
  serviceName: legacyServiceName,
  vendorName: legacyVendorName,
  projectName: legacyProjectName,
  onStatusChange,
  onDelete,
  onTotalsChanged,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const status = commitment.status || "planned";
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
  const nextStatus = NEXT_STATUS[status];

  // Use canonical pre-joined names; fall back to legacy props
  const serviceName = commitment.service_name || legacyServiceName || "Unknown";
  const vendorName = commitment.vendor_name || legacyVendorName;
  const projectName = commitment.project_name || legacyProjectName;

  // CANONICAL cost/margin from read model (line-item-derived ONLY)
  const totalCost = commitment.total_cost || 0;
  const totalBillable = commitment.total_billable || 0;
  const margin = commitment.margin_pct ?? (totalBillable > 0 ? ((totalBillable - totalCost) / totalBillable) * 100 : null);
  // CANONICAL: Use billing_locked from read model (is_billed || invoice_id)
  const billingLocked = commitment.billing_locked === true || commitment.is_billed === true || commitment.invoice_id != null;
  const marginWarning = commitment.margin_warning === true;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
      {/* Main Row */}
      <div className="flex items-center gap-3 p-3">
        {/* Expand toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </Button>

        {/* Service info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {commitment.description}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 truncate mt-0.5">
            {serviceName}
            {vendorName && ` · ${vendorName}`}
            {projectName && ` · ${projectName}`}
            {commitment.quantity > 1 && ` · Qty: ${commitment.quantity}`}
          </p>
        </div>

        {/* Financial summary — single line */}
        <div className="hidden md:flex items-center gap-1 text-xs font-mono text-gray-400 shrink-0">
          <span className="text-gray-500">Cost</span>
          <span className="text-gray-300">{formatCurrencyUSD(totalCost)}</span>
          <span className="text-gray-600 mx-0.5">·</span>
          <span className="text-gray-500">Rev</span>
          <span className="text-white">{formatCurrencyUSD(totalBillable)}</span>
          {margin != null && (
            <>
              <span className="text-gray-600 mx-0.5">·</span>
              <span className={margin >= 0 ? "text-emerald-400" : "text-red-400"}>
                {typeof margin === 'number' ? margin.toFixed(0) : '0'}%
              </span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {nextStatus && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-blue-700 text-blue-400 hover:bg-blue-900/30 font-medium"
              onClick={() => onStatusChange(commitment.id, nextStatus)}
            >
              {NEXT_LABEL[status]}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
              <DropdownMenuItem onClick={() => setExpanded(!expanded)} className="text-gray-200">
                <List className="w-3.5 h-3.5 mr-2" />
                {expanded ? "Hide" : "Show"} Line Items
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowEditModal(true)} className="text-gray-200">
                <Pencil className="w-3.5 h-3.5 mr-2" />
                Edit Service
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-700" />
              {billingLocked ? (
                <DropdownMenuItem disabled className="text-gray-500">
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete (Locked)
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-400">
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded Line Items */}
      {expanded && (
        <div className="border-t border-gray-700/50 px-3 pb-3 pt-2 ml-9">
          <ServiceLineItemManager
            commitmentId={commitment.id}
            serviceGroupId={commitment.service_group_id || null}
            onTotalsChanged={onTotalsChanged}
            billingLocked={billingLocked}
          />
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditServiceModal
          commitment={commitment}
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={onTotalsChanged}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <DeleteServiceConfirmModal
          commitment={commitment}
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onSuccess={() => onDelete?.(commitment.id, true)}
        />
      )}
    </div>
  );
}