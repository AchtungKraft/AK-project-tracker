import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * PHASE 1 — Hook for Canonical Financial Projects View
 * 
 * Single source of truth for project dropdowns in billing UI.
 * Uses getFinancialProjectsView backend function.
 */
export function useFinancialProjectsView(options = {}) {
  return useQuery({
    queryKey: ["financialProjectsView"],
    queryFn: async () => {
      const response = await base44.functions.invoke("getFinancialProjectsView", {});
      return response.data;
    },
    staleTime: 30000,
    ...options,
  });
}

/**
 * Hook for Canonical Billable Parts View
 * 
 * Returns grouped billable parts for a specific project.
 * Uses getBillablePartsView backend function.
 */
export function useBillablePartsView(projectId, groupingMode = "vendor", options = {}) {
  return useQuery({
    queryKey: ["billablePartsView", projectId, groupingMode],
    queryFn: async () => {
      if (!projectId) return null;
      const response = await base44.functions.invoke("getBillablePartsView", {
        project_id: projectId,
        grouping_mode: groupingMode,
      });
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 30000,
    ...options,
  });
}

/**
 * Group projects by project type for dropdown display
 */
export function groupProjectsByType(projects) {
  if (!projects || projects.length === 0) return [];

  const groups = {};
  
  for (const project of projects) {
    const typeName = project.project_type_name || "Uncategorized";
    if (!groups[typeName]) {
      groups[typeName] = {
        type_name: typeName,
        type_color: project.project_type_color || "#6B7280",
        projects: [],
      };
    }
    groups[typeName].projects.push(project);
  }

  // Sort groups alphabetically, then projects within each group
  return Object.values(groups)
    .sort((a, b) => a.type_name.localeCompare(b.type_name))
    .map((group) => ({
      ...group,
      projects: group.projects.sort((a, b) => a.project_name.localeCompare(b.project_name)),
    }));
}