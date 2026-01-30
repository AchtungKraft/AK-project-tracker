// --- imports unchanged ---
import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  FolderKanban,
  ChevronRight,
  Loader2,
  Mail,
  Send,
  Menu,
  MessageSquareText,
  LayoutGrid,
  List,
  Eye,
  User,
  X
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ClientPortalAdminTab from "@/components/clientportal/ClientPortalAdminTab";
import ClientPortalListView from "@/components/clientportal/ClientPortalListView";
import NeedsAttentionSection, {
  getAttentionType,
  AttentionBadge,
  getAttentionPriority,
  OwnershipBadge
} from "@/components/clientportal/NeedsAttentionSection";
import {
  getReviewOwnership,
  getOwnershipSortPriority
} from "@/components/clientportal/reviewOwnership";
import { useSavedProjectViews } from "@/components/common/useSavedProjectViews";
import SavedViewsSelector from "@/components/common/SavedViewsSelector";
import { CopyRequestLinkButton } from "@/components/clientportal/ClientLinksCopyButtons";
import { useFilterState, CLIENT_PORTAL_DEFAULTS } from "@/components/common/useFilterState";

/* -----------------------------
   Helper: derive request state
------------------------------ */
const getRequestState = (request, decisions, attachments) => {
  if (request.status === "draft") return "draft";
  if (request.status === "archived") return "archived";

  if (request.status === "approved" && !request.posted_at) return "approved";
  if (request.status === "changes_requested" && !request.posted_at) return "changes_requested";

  const postedAt = request.posted_at ? new Date(request.posted_at) : null;

  const requestDecisions = decisions.filter(d => {
    if (d.request_id !== request.id) return false;
    if (postedAt && d.decided_at) return new Date(d.decided_at) > postedAt;
    if (postedAt && d.created_date) return new Date(d.created_date) > postedAt;
    return true;
  });

  const hasApproval = requestDecisions.some(
    d => d.decision === "approved" && d.target_type === "request"
  );
  const hasChanges = requestDecisions.some(d => d.decision === "changes_requested");

  if (hasApproval) return "approved";
  if (hasChanges) return "changes_requested";

  if (request.request_type === "design_review") {
    const images = attachments.filter(
      a => a.request_id === request.id && a.attachment_type === "image"
    );
    const imageDecisions = requestDecisions.filter(
      d => d.target_type === "attachment_image"
    );

    if (images.length && imageDecisions.length >= images.length) {
      const allApproved = images.every(img =>
        imageDecisions.some(
          d => d.target_image_url === img.file_url && d.decision === "approved"
        )
      );
      return allApproved ? "approved" : "changes_requested";
    }
  }

  return "awaiting_review";
};

/* =============================
   ClientPortalHub
============================= */
export default function ClientPortalHub() {
  const queryClient = useQueryClient();
  const [sendingEmailForProject, setSendingEmailForProject] = useState(null);

  const { filters, setFilter, applyView } = useFilterState(
    "clientportal",
    CLIENT_PORTAL_DEFAULTS
  );
  const { selectedTypes, statusFilter, assignedTo, viewMode, tab: activeTab } = filters;

  const handleAssignedToChange = useCallback(
    v => setFilter("assignedTo", v),
    [setFilter]
  );

  const {
    savedViews,
    activeViewName,
    saveView,
    deleteView,
    renameView,
    selectView
  } = useSavedProjectViews();

  const handleSelectView = useCallback(
    name => {
      const view = selectView(name);
      if (view) applyView(view);
    },
    [selectView, applyView]
  );

  const handleSendBulkEmail = async (projectId, requestIds) => {
    setSendingEmailForProject(projectId);
    try {
      const res = await base44.functions.invoke("sendBulkReviewEmail", {
        projectId,
        requestIds
      });
      if (res.data?.success) {
        toast.success(`Email sent to ${res.data.emailsSent} client(s)`);
        queryClient.invalidateQueries({ queryKey: ["allFeedbackRequests"] });
      } else {
        toast.error(res.data?.error || "Failed to send email");
      }
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSendingEmailForProject(null);
    }
  };

  /* -----------*
