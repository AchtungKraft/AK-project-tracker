import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  buildScopeHierarchy,
  computeRollup,
  computeMaterialHash,
} from "./scopeHelpers";
import ScopeCategorySection from "./ScopeCategorySection";
import ScopeSummaryBar from "./ScopeSummaryBar";
import ScopeConfirmPanel from "./ScopeConfirmPanel";
import ScopeFilterBar from "./ScopeFilterBar";
import ScopeAdminControls from "./ScopeAdminControls";
import ScopeItemEditor from "./ScopeItemEditor";

/**
 * Main Scope Review Display for a client_scope_review request.
 * Used in both internal and public client views.
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
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const readOnly = isClientView && clientAccessRole !== 'approver';
  const canEdit = !isClientView; // Only internal users can edit structure/items

  // Load all scope data
  const { data: scopeData, isLoading } = useQuery({
    queryKey: ['scopeReviewData', requestId],
    queryFn: async () => {
      const [categories, groups, items, comments, history, confirmations] = await Promise.all([
        base44.entities.ScopeCategory.filter({ request_id: requestId }),
        base44.entities.ScopeGroup.filter({ request_id: requestId }),
        base44.entities.ScopeItem.filter({ request_id: requestId }),
        base44.entities.ScopeItemComment.filter({ request_id: requestId }),
        base44.entities.ScopeItemHistory.filter({ request_id: requestId }),
        base44.entities.ScopeConfirmation.filter({ request_id: requestId }),
      ]);
      return { categories, groups, items, comments, history, confirmations };
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
  const lastConfirmation = confirmations.sort((a, b) => new Date(b.confirmed_at) - new Date(a.confirmed_at))[0];

  const hierarchy = useMemo(() => buildScopeHierarchy(categories, groups, items), [categories, groups, items]);
  const stats = useMemo(() => computeRollup(items), [items]);

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

    // If approving, store material hash
    if (decision === 'approved') {
      updateData.material_hash = computeMaterialHash(item);
    }

    await base44.entities.ScopeItem.update(itemId, updateData);

    // Record history
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
  }, [items, isClientView, clientContactId, userId, userName, requestId, invalidate]);

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

    await base44.entities.ScopeConfirmation.create({
      request_id: requestId,
      confirmed_at: new Date().toISOString(),
      confirmed_by_type: actorType,
      confirmed_by_id: actorId,
      confirmed_by_name: actorName,
      approved_item_ids: approved.map(i => i.id),
      approved_budget_min: approvedBudgetMin,
      approved_budget_max: approvedBudgetMax,
      total_items: items.length,
      revision,
      summary_snapshot: stats,
    });

    // Update the request with confirmation metadata
    await base44.entities.ClientFeedbackRequest.update(requestId, {
      scope_confirmed_at: new Date().toISOString(),
      scope_confirmed_by_name: actorName,
    });

    invalidate();
    queryClient.invalidateQueries({ queryKey }); // refresh parent detail view
    toast({ description: `Scope confirmed — ${approved.length} items approved` });
  }, [items, stats, lastConfirmation, requestId, isClientView, clientContactId, userId, userName, invalidate, queryClient, queryKey, toast]);

  // ─── Admin CRUD ───
  const handleCreateCategory = useCallback(async (name) => {
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    await base44.entities.ScopeCategory.create({ request_id: requestId, name, sort_order: maxOrder + 1 });
    invalidate();
  }, [categories, requestId, invalidate]);

  const handleDeleteCategory = useCallback(async (catId) => {
    const catItems = items.filter(i => i.category_id === catId);
    const catGroups = groups.filter(g => g.category_id === catId);
    if (catItems.length > 0) { toast({ variant: 'destructive', description: 'Remove all items first' }); return; }
    await Promise.all(catGroups.map(g => base44.entities.ScopeGroup.delete(g.id)));
    await base44.entities.ScopeCategory.delete(catId);
    invalidate();
  }, [items, groups, invalidate, toast]);

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

  const handleCreateGroup = useCallback(async (catId, name) => {
    const catGroups = groups.filter(g => g.category_id === catId);
    const maxOrder = catGroups.reduce((m, g) => Math.max(m, g.sort_order || 0), 0);
    await base44.entities.ScopeGroup.create({ request_id: requestId, category_id: catId, name, sort_order: maxOrder + 1 });
    invalidate();
  }, [groups, requestId, invalidate]);

  const handleDeleteGroup = useCallback(async (grpId) => {
    const grpItems = items.filter(i => i.group_id === grpId);
    if (grpItems.length > 0) { toast({ variant: 'destructive', description: 'Remove all items first' }); return; }
    await base44.entities.ScopeGroup.delete(grpId);
    invalidate();
  }, [items, invalidate, toast]);

  const handleReorderGroup = useCallback(async (grpId, direction) => {
    const grp = groups.find(g => g.id === grpId);
    if (!grp) return;
    const siblings = groups.filter(g => g.category_id === grp.category_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = siblings.findIndex(g => g.id === grpId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx], b = siblings[swapIdx];
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

  // ─── Item CRUD ───
  const handleSaveItem = useCallback(async (data, existingId) => {
    if (existingId) {
      // Check reapproval
      const existing = items.find(i => i.id === existingId);
      if (existing && existing.decision_status === 'approved') {
        const oldHash = existing.material_hash;
        const newHash = computeMaterialHash({ ...existing, ...data });
        if (oldHash && oldHash !== newHash) {
          data.decision_status = 'reapproval_required';
          // Record history
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
      const siblings = items.filter(i => i.group_id === data.group_id);
      data.sort_order = siblings.reduce((m, i) => Math.max(m, i.sort_order || 0), 0) + 1;
      await base44.entities.ScopeItem.create(data);
    }
    setShowAddItem(false);
    setEditingItem(null);
    invalidate();
    toast({ description: existingId ? 'Item updated' : 'Item added' });
  }, [items, requestId, userId, userName, invalidate, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <ScopeSummaryBar stats={stats} isMobile={isMobile} />

      {/* Filter Bar */}
      {items.length > 0 && (
        <ScopeFilterBar value={filter} onChange={setFilter} stats={stats} isMobile={isMobile} />
      )}

      {/* Admin Controls — internal only */}
      {canEdit && (
        <ScopeAdminControls
          categories={categories}
          groups={groups}
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

      {/* Add Item */}
      {canEdit && !showAddItem && !editingItem && categories.length > 0 && groups.length > 0 && (
        <Button size="sm" onClick={() => setShowAddItem(true)} className="bg-gray-700 hover:bg-gray-600 text-white gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Scope Item
        </Button>
      )}

      {canEdit && showAddItem && (
        <ScopeItemEditor
          requestId={requestId}
          categories={categories}
          groups={groups}
          onSave={handleSaveItem}
          onCancel={() => setShowAddItem(false)}
          isMobile={isMobile}
        />
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
              onDecision={handleDecision}
              onComment={handleComment}
              isClientView={isClientView}
              readOnly={readOnly}
              onEditItem={canEdit ? setEditingItem : undefined}
              isMobile={isMobile}
              filter={filter}
            />
          ))}
        </div>
      ) : (
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">{canEdit ? 'Create categories and groups above, then add scope items.' : 'No scope items yet.'}</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Item Modal */}
      {canEdit && editingItem && (
        <ScopeItemEditor
          requestId={requestId}
          categories={categories}
          groups={groups}
          editItem={editingItem}
          onSave={handleSaveItem}
          onCancel={() => setEditingItem(null)}
          isMobile={isMobile}
        />
      )}

      {/* Scope Confirmation Panel */}
      {items.length > 0 && (
        <ScopeConfirmPanel
          stats={stats}
          lastConfirmation={lastConfirmation}
          onConfirm={handleConfirm}
          readOnly={readOnly}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}