import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useMemo } from "react";

/**
 * Hook for fetching and formatting Task Categories for dropdowns
 * Returns hierarchical categories sorted by sort_order with parent/child structure
 */
export function useTaskCategories(enabled = true) {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
    enabled,
    staleTime: 60_000,
  });

  // Build hierarchical list: parents first, then their children, all sorted by sort_order
  const sortedCategories = useMemo(() => {
    const active = categories.filter(c => c.active !== false);
    const parents = active
      .filter(c => !c.parent_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const result = [];
    parents.forEach(parent => {
      result.push({ ...parent, isParent: true });
      const children = active
        .filter(c => c.parent_id === parent.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      children.forEach(child => {
        result.push({ ...child, isChild: true, parentName: parent.name });
      });
    });
    
    return result;
  }, [categories]);

  return { categories: sortedCategories, isLoading };
}

/**
 * Hook for fetching and formatting Task Statuses for dropdowns
 * Returns active Task statuses sorted by sort_order
 */
export function useTaskStatuses(enabled = true) {
  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ['taskStatuses'],
    queryFn: () => base44.entities.StatusList.list(),
    enabled,
    staleTime: 60_000,
  });

  const sortedStatuses = useMemo(() => {
    return statuses
      .filter(s => s.scope === 'Task' && s.active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [statuses]);

  // Get default status (first in sorted order)
  const defaultStatusId = sortedStatuses[0]?.id || '';

  return { statuses: sortedStatuses, defaultStatusId, isLoading };
}

/**
 * Hook for fetching and formatting Team Members for dropdowns
 * Returns active team members sorted by sort_order
 */
export function useAssignableTeamMembers(enabled = true) {
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled,
    staleTime: 60_000,
  });

  const sortedMembers = useMemo(() => {
    return teamMembers
      .filter(tm => tm.active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [teamMembers]);

  return { teamMembers: sortedMembers, isLoading };
}