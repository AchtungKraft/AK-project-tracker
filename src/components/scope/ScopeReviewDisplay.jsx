import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  buildScopeHierarchy,
  computeRollup,
  computeMaterialHash,
  DECISION_LABELS,
} from "./scopeHelpers";
import ScopeCategorySection from "./ScopeCategorySection";
import ScopeSummaryBar from "./ScopeSummaryBar";
import ScopeConfirmPanel from "./ScopeConfirmPanel";
import ScopeFilterBar from "./ScopeFilterBar";
import ScopeAdminControls from "./ScopeAdminControls";
import ScopeItemEditor from "./ScopeItemEditor";
import LaborBreakdownPanel from "./LaborBreakdownPanel";

/**
 * Main Scope Review Display for a client_scope_review request.
 * Architecture: Categories and Groups are independent request-level entities.
 * Items belong to one Category and one Group. Display is Category → Group → Item.
 */
export default function ScopeReviewDisplay({
  requestId,
  queryKey,
  token,
  slug,
  isClientView = false,
  isMobile = false,
  clientAccessRole,
  clientContactId,
  userId,
  userName,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [addItemState, setAddItemState] = useState(null); // null | { categoryId?, groupId? }
  const [editingItem, setEditingItem] = useState(null);

  const readOnly = isClientView && clientAccessRole !== 'approver';
  const canEdit = !isClientView;

  // Load all scope data
  const { data: scopeData, isLoading } = useQuery({
    queryKey: ['scopeReviewData', requestId],
    queryFn: async () => {
      const [categories, groups, items, comments, history, confirmations, laborEstimates, laborGroups] = await Promise.all([
        base44.entities.ScopeCategory.filter({ request_id: requestId }),
        base44.entities.ScopeGroup.filter({ request_id: requestId }),
        base44.entities.ScopeItem.filter({ request_id: requestId }),
        base44.entities.ScopeItemComment.filter({ request_id: requestId }),
        base44.entities.ScopeItemHistory.filter({ request_id: requestId }),
        base44.entities.ScopeConfirmation.filter({ request_id: requestId }),
        base44.entities.ScopeItemLaborEstimate.filter({ request_id: requestId }),
        base44.entities.ScopeLaborGroup.filter({ is_active: true }),
      ]);
      return { categories, groups, items, comments, history, confirmations, laborEstimates, laborGroups };
    },
    enabled: !!requestId,
    staleTime: 15000,
  });

  const categories = scopeData?.categories || [];
  const groups = scopeData?.groups || [];
  const items = scopeData?.items || [];
  const comments = scopeData?.comments || [];
  const history = scopeData?.history || [];
  const confirmations = scopeData?.confirmations || [];
  const laborEstimates = scopeData?.laborEstimates || [];
  const laborGroups = scopeData?.laborGroups || [];
  const lastConfirmation = confirmations.sort((a, b) => new Date(b.confirmed_at) - new Date(a.confirmed_at))[0];

  const hierarchy = useMemo(() => buildScopeHierarchy(categories, groups, items), [categories, groups, items]);
  const stats = useMemo(() => computeRollup(items, laborEstimates), [items, laborEstimates]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['scopeReviewData', requestId] });
  }, [queryClient, requestId]);

  // ─── Decision handler ───
  const handleDecision = useCallback(async (itemId, decision) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const actorType = isClientView ? 'client_contact' : 'internal_user';
    const actorId = isClientView ? clientContactId : userId;
    const actorName = userName || 'Staff';
    const now = new Date().toISOString();

    const updateData = {
      decision_status: decision,
      decision_at: now,
      decision_actor_type: actorType,
      decision_actor_id: actorId,
    };

    if (decision === 'approved') {
      updateData.material_hash = computeMaterialHash(item, laborEstimates);
    }

    await base44.entities.ScopeItem.update(itemId, updateData);

    await base44.entities.ScopeItemHistory.create({
      scope_item_id: itemId,
      request_id: requestId,
      event_type: 'decision',
      decision,
      previous_decision: item.decision_status || 'needs_review',
      actor_type: actorType,
      actor_id: actorId,
      actor_name: actorName,
      recorded_at: now,
    });

    invalidate();
  }, [items, laborEstimates, isClientView, clientContactId, userId, userName, requestId, invalidate]);

  // ─── Comment handler ───
  const handleComment = useCallback(async (itemId, body) => {
    const actorType = isClientView ? 'client_contact' : 'internal_user';
    const actorId = isClientView ? clientContactId : userId;
    const actorName = userName || 'Staff';

    await base44.entities.ScopeItemComment.create({
      scope_item_id: itemId,
      request_id: requestId,
      author_type: actorType,
      author_id: actorId,
      author_name: actorName,
      body,
      posted_at: new Date().toISOString(),
    });
    invalidate();
  }, [isClientView, clientContactId, userId, userName, requestId, invalidate]);

  // ─── Scope Confirmation handler ───
  const handleConfirm = useCallback(async () => {
    const actorType = isClientView ? 'client_contact' : 'internal_user';
    const actorId = isClientView ? clientContactId : userId;
    const actorName = userName || 'Client';
    const approved = items.filter(i => i.decision_status === 'approved');
    const approvedBudgetMin = approved.reduce((s, i) => s + (i.budget_min || 0), 0);
    const approvedBudgetMax = approved.reduce((s, i) => s + (i.budget_max || 0), 0);
    const revision = (lastConfirmation?.revision || 0) + 1;

    // Compute approved labor snapshot
    const approvedIds = new Set(approved.map(i => i.id));
    const approvedLabor = laborEstimates.filter(le => approvedIds.has(le.scope_item_id));
    const approvedAkHoursMin = approvedLabor.reduce((s, le) => s + (le.hours_min || 0), 0);
    const approvedAkHoursMax = approvedLabor.reduce((s, le) => s + (le.hours_max || 0), 0);
    const approvedAkLaborMin = approvedLabor.reduce((s, le) => s + (le.hours_min || 0) * (le.rate_snapshot || 0), 0);
    const approvedAkLaborMax = approvedLabor.reduce((s, le) => s + (le.hours_max || 0) * (le.rate_snapshot || 0), 0);

    await base44.entities.ScopeConfirmation.create({
      request_id: requestId,
      confirmed_at: new Date().toISOString(),
      confirmed_by_type: actorType,
      confirmed_by_id: actorId,
      confirmed_by_name: actorName,
      approved_item_ids: approved.map(i => i.id),
      approved_budget_min: approvedBudgetMin,
      approved_budget_max: approvedBudgetMax,
      approved_ak_hours_min: approvedAkHoursMin,
      approved_ak_hours_max: approvedAkHoursMax,
      total_items: items.length,
      revision,
      summary_snapshot: { ...stats, approved_ak_labor_min: approvedAkLaborMin, approved_ak_labor_max: approvedAkLaborMax },
    });

    await base44.entities.ClientFeedbackRequest.update(requestId, {
      scope_confirmed_at: new Date().toISOString(),
      scope_confirmed_by_name: actorName,
    });

    invalidate();
    queryClient.invalidateQueries({ queryKey });
    toast({ description: `Scope confirmed — ${approved.length} items approved` });
  }, [items, stats, lastConfirmation, requestId, isClientView, clientContactId, userId, userName, invalidate, queryClient, queryKey, toast]);

  // ─── Admin: Category CRUD ───
  const handleCreateCategory = useCallback(async (name) => {
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    await base44.entities.ScopeCategory.create({ request_id: requestId, name, sort_order: maxOrder + 1 });
    invalidate();
  }, [categories, requestId, invalidate]);

  const handleDeleteCategory = useCallback(async (catId) => {
    const catItems = items.filter(i => i.category_id === catId);
    if (catItems.length > 0) { toast({ variant: 'destructive', description: 'Remove or reassign all items first' }); return; }
    await base44.entities.ScopeCategory.delete(catId);
    invalidate();
  }, [items, invalidate, toast]);

  const handleReorderCategory = useCallback(async (catId, direction) => {
    const sorted = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sorted.findIndex(c => c.id === catId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      base44.entities.ScopeCategory.update(a.id, { sort_order: b.sort_order || 0 }),
      base44.entities.ScopeCategory.update(b.id, { sort_order: a.sort_order || 0 }),
    ]);
    invalidate();
  }, [categories, invalidate]);

  const handleRenameCategory = useCallback(async (catId, name) => {
    if (!name.trim()) return;
    await base44.entities.ScopeCategory.update(catId, { name: name.trim() });
    invalidate();
  }, [invalidate]);

  // ─── Admin: Group CRUD (request-level, no category_id) ───
  const handleCreateGroup = useCallback(async (name) => {
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.sort_order || 0), 0);
    await base44.entities.ScopeGroup.create({ request_id: requestId, name, sort_order: maxOrder + 1 });
    invalidate();
  }, [groups, requestId, invalidate]);

  const handleDeleteGroup = useCallback(async (grpId) => {
    const grpItems = items.filter(i => i.group_id === grpId);
    if (grpItems.length > 0) { toast({ variant: 'destructive', description: 'Remove or reassign all items first' }); return; }
    await base44.entities.ScopeGroup.delete(grpId);
    invalidate();
  }, [items, invalidate, toast]);

  const handleReorderGroup = useCallback(async (grpId, direction) => {
    const sorted = [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sorted.findIndex(g => g.id === grpId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      base44.entities.ScopeGroup.update(a.id, { sort_order: b.sort_order || 0 }),
      base44.entities.ScopeGroup.update(b.id, { sort_order: a.sort_order || 0 }),
    ]);
    invalidate();
  }, [groups, invalidate]);

  const handleRenameGroup = useCallback(async (grpId, name) => {
    if (!name.trim()) return;
    await base44.entities.ScopeGroup.update(grpId, { name: name.trim() });
    invalidate();
  }, [invalidate]);

  // ─── Staff Status Override ───
  const handleStaffStatusChange = useCallback(async (itemId, newStatus, note) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const now = new Date().toISOString();
    const previous = item.decision_status || 'needs_review';

    const updateData = {
      decision_status: newStatus,
      decision_at: now,
      decision_actor_type: 'internal_user',
      decision_actor_id: userId,
    };
    if (newStatus === 'approved') {
      updateData.material_hash = computeMaterialHash(item, laborEstimates);
    }

    await base44.entities.ScopeItem.update(itemId, updateData);

    await base44.entities.ScopeItemHistory.create({
      scope_item_id: itemId,
      request_id: requestId,
      event_type: 'decision',
      decision: newStatus,
      previous_decision: previous,
      actor_type: 'internal_user',
      actor_id: userId,
      actor_name: userName || 'Achtung Kraft',
      note: note || null,
      recorded_at: now,
    });

    invalidate();
    toast({ description: `Status changed: ${DECISION_LABELS[previous]} → ${DECISION_LABELS[newStatus]}` });
  }, [items, requestId, userId, userName, invalidate, toast]);

  const handleStaffRequireReapproval = useCallback(async (itemId, note) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const now = new Date().toISOString();
    const previous = item.decision_status || 'needs_review';

    await base44.entities.ScopeItem.update(itemId, {
      decision_status: 'reapproval_required',
      decision_at: now,
      decision_actor_type: 'internal_user',
      decision_actor_id: userId,
    });

    await base44.entities.ScopeItemHistory.create({
      scope_item_id: itemId,
      request_id: requestId,
      event_type: 'reapproval_triggered',
      decision: 'reapproval_required',
      previous_decision: previous,
      actor_type: 'internal_user',
      actor_id: userId,
      actor_name: userName || 'Achtung Kraft',
      note: note || 'Staff requested reapproval',
      recorded_at: now,
    });

    invalidate();
    toast({ description: 'Reapproval required — item returned for client review' });
  }, [items, requestId, userId, userName, invalidate, toast]);

  // ─── Item CRUD ───
  const handleSaveItem = useCallback(async (data, existingId, laborData) => {
    let itemId = existingId;
    if (existingId) {
      const existing = items.find(i => i.id === existingId);
      // Build new hash including labor changes
      const newHash = computeMaterialHash({ ...existing, ...data }, laborData ? laborData.map((ld, i) => ({ ...ld, scope_item_id: existingId })) : laborEstimates);
      if (existing && existing.decision_status === 'approved') {
        const oldHash = existing.material_hash;
        if (oldHash && oldHash !== newHash) {
          data.decision_status = 'reapproval_required';
          await base44.entities.ScopeItemHistory.create({
            scope_item_id: existingId,
            request_id: requestId,
            event_type: 'reapproval_triggered',
            previous_decision: 'approved',
            decision: 'reapproval_required',
            actor_type: 'internal_user',
            actor_id: userId,
            actor_name: userName || 'Staff',
            note: 'Material fields changed after approval',
            recorded_at: new Date().toISOString(),
          });
        }
      }
      await base44.entities.ScopeItem.update(existingId, data);
    } else {
      const siblings = items.filter(i => i.group_id === data.group_id && i.category_id === data.category_id);
      data.sort_order = siblings.reduce((m, i) => Math.max(m, i.sort_order || 0), 0) + 1;
      const created = await base44.entities.ScopeItem.create(data);
      itemId = created.id;
    }

    // Handle labor estimates CRUD
    if (laborData && itemId) {
      try {
        // Delete existing labor estimates for this item
        const existingLabor = laborEstimates.filter(le => le.scope_item_id === itemId);
        if (existingLabor.length > 0) {
          await Promise.all(existingLabor.map(le => base44.entities.ScopeItemLaborEstimate.delete(le.id)));
        }
        // Create new ones
        const validLabor = laborData.filter(ld => ld.labor_group_id && ld.hours_min !== "" && ld.hours_max !== "");
        if (validLabor.length > 0) {
          await base44.entities.ScopeItemLaborEstimate.bulkCreate(
            validLabor.map((ld, idx) => ({
              request_id: requestId,
              scope_item_id: itemId,
              labor_group_id: ld.labor_group_id,
              labor_group_name_snapshot: ld.labor_group_name_snapshot || '',
              hours_min: Number(ld.hours_min) || 0,
              hours_max: Number(ld.hours_max) || 0,
              rate_snapshot: ld.rate_snapshot || 0,
              sort_order: idx,
            }))
          );
        }
      } catch (laborErr) {
        console.error('Labor estimate save failed:', laborErr);
        invalidate(); // Refetch canonical data so UI reflects actual persisted state
        toast({ variant: 'destructive', description: 'Item saved but labor estimates failed to save. Please re-edit.' });
        setAddItemState(null);
        setEditingItem(null);
        return;
      }
    }

    setAddItemState(null);
    setEditingItem(null);
    invalidate();
    toast({ description: existingId ? 'Item updated' : 'Item added' });
  }, [items, laborEstimates, requestId, userId, userName, invalidate, toast]);

  // ─── Add Item with optional preselection ───
  const handleAddItem = useCallback((preselection = {}) => {
    setEditingItem(null);
    setAddItemState(preselection);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  const showEditor = canEdit && (addItemState !== null || editingItem);

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <ScopeSummaryBar stats={stats} isMobile={isMobile} isClientView={isClientView} />

      {/* Filter Bar */}
      {items.length > 0 && (
        <ScopeFilterBar value={filter} onChange={setFilter} stats={stats} isMobile={isMobile} />
      )}

      {/* Admin Controls — internal only */}
      {canEdit && (
        <ScopeAdminControls
          categories={categories}
          groups={groups}
          items={items}
          onCreateCategory={handleCreateCategory}
          onDeleteCategory={handleDeleteCategory}
          onReorderCategory={handleReorderCategory}
          onRenameCategory={handleRenameCategory}
          onCreateGroup={handleCreateGroup}
          onDeleteGroup={handleDeleteGroup}
          onReorderGroup={handleReorderGroup}
          onRenameGroup={handleRenameGroup}
          isMobile={isMobile}
        />
      )}

      {/* Persistent Add Item button — visible when categories and groups exist */}
      {canEdit && !showEditor && categories.length > 0 && groups.length > 0 && (
        <Button size="sm" onClick={() => handleAddItem({})} className="bg-gray-700 hover:bg-gray-600 text-white gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Scope Item
        </Button>
      )}

      {/* Item Editor — add or edit */}
      {canEdit && addItemState !== null && !editingItem && (
        <ScopeItemEditor
          requestId={requestId}
          categories={categories}
          groups={groups}
          laborGroups={laborGroups}
          preselectedCategoryId={addItemState.categoryId}
          preselectedGroupId={addItemState.groupId}
          onSave={handleSaveItem}
          onCancel={() => setAddItemState(null)}
          isMobile={isMobile}
        />
      )}
      {canEdit && editingItem && (
        <ScopeItemEditor
          requestId={requestId}
          categories={categories}
          groups={groups}
          laborGroups={laborGroups}
          laborEstimates={laborEstimates.filter(le => le.scope_item_id === editingItem.id)}
          editItem={editingItem}
          onSave={handleSaveItem}
          onCancel={() => setEditingItem(null)}
          isMobile={isMobile}
        />
      )}

      {/* Labor Breakdown — internal only */}
      {!isClientView && laborEstimates.length > 0 && (
        <LaborBreakdownPanel items={items} laborEstimates={laborEstimates} isMobile={isMobile} />
      )}

      {/* Hierarchy */}
      {hierarchy.length > 0 ? (
        <div className="space-y-4">
          {hierarchy.map(cat => (
            <ScopeCategorySection
              key={cat.id}
              category={cat}
              comments={comments}
              history={history}
              laborEstimates={laborEstimates}
              onDecision={handleDecision}
              onComment={handleComment}
              onStaffStatusChange={canEdit ? handleStaffStatusChange : undefined}
              onStaffRequireReapproval={canEdit ? handleStaffRequireReapproval : undefined}
              isClientView={isClientView}
              readOnly={readOnly}
              onEditItem={canEdit ? setEditingItem : undefined}
              onAddItem={canEdit ? handleAddItem : undefined}
              isMobile={isMobile}
              filter={filter}
            />
          ))}
        </div>
      ) : (
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-gray-500">
              {canEdit
                ? categories.length === 0 || groups.length === 0
                  ? 'Create categories and groups above, then add scope items.'
                  : 'No scope items yet. Click "Add Scope Item" to get started.'
                : 'No scope items yet.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scope Confirmation Panel */}
      {items.length > 0 && (
        <ScopeConfirmPanel
          stats={stats}
          items={items}
          lastConfirmation={lastConfirmation}
          onConfirm={handleConfirm}
          readOnly={readOnly}
          isMobile={isMobile}
          isClientView={isClientView}
        />

      )}
    </div>
  );
}