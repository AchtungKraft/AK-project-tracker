import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Hook to fetch financial status for a single part context
 */
export function useFinancialStatus(partId, options = {}) {
  const { projectId, purchaseLineItemId, commitmentId, enabled = true } = options;
  
  return useQuery({
    queryKey: ['financial-status', partId, projectId, purchaseLineItemId, commitmentId],
    queryFn: async () => {
      const response = await base44.functions.invoke('resolveFinancialStatus', {
        part_id: partId,
        project_id: projectId,
        purchase_line_item_id: purchaseLineItemId,
        commitment_id: commitmentId,
      });
      return response.data?.result || null;
    },
    enabled: enabled && !!partId,
    staleTime: 30000, // 30 seconds
    cacheTime: 60000, // 1 minute
  });
}

/**
 * Hook to batch fetch financial status for multiple part contexts
 * Avoids N+1 queries by batching all requests
 */
export function useFinancialStatusBatch(contexts, options = {}) {
  const { enabled = true } = options;
  
  // Create a stable cache key from contexts
  const cacheKey = contexts?.map(c => 
    `${c.part_id}:${c.project_id || ''}:${c.purchase_line_item_id || ''}:${c.commitment_id || ''}`
  ).join('|') || '';
  
  return useQuery({
    queryKey: ['financial-status-batch', cacheKey],
    queryFn: async () => {
      if (!contexts || contexts.length === 0) return [];
      
      const response = await base44.functions.invoke('resolveFinancialStatus', {
        contexts: contexts.filter(c => c.part_id), // Filter out invalid contexts
      });
      
      return response.data?.results || [];
    },
    enabled: enabled && contexts && contexts.length > 0,
    staleTime: 30000,
    cacheTime: 60000,
  });
}

/**
 * Utility to build contexts array from various data sources
 */
export function buildFinancialContexts(items, options = {}) {
  const { partIdKey = 'part_id', projectIdKey = 'project_id' } = options;
  
  return items.map(item => ({
    part_id: item[partIdKey] || item.id,
    project_id: item[projectIdKey] || null,
    purchase_line_item_id: item.purchase_line_item_id || item.line_item_id || null,
    commitment_id: item.commitment_id || null,
  }));
}

/**
 * Merge financial status results back into items array
 */
export function mergeFinancialStatus(items, statusResults, options = {}) {
  const { partIdKey = 'part_id' } = options;
  
  if (!statusResults || statusResults.length === 0) return items;
  
  // Build lookup map from results
  const statusMap = new Map();
  for (const status of statusResults) {
    const key = `${status.part_id}:${status.project_id || ''}:${status.purchase_line_item_id || ''}:${status.commitment_id || ''}`;
    statusMap.set(key, status);
  }
  
  // Merge into items
  return items.map(item => {
    const partId = item[partIdKey] || item.id;
    const key = `${partId}:${item.project_id || ''}:${item.purchase_line_item_id || item.line_item_id || ''}:${item.commitment_id || ''}`;
    const financialStatus = statusMap.get(key);
    
    // Also try simpler key with just part_id
    const simpleKey = `${partId}:::`;
    const simpleStatus = statusMap.get(simpleKey);
    
    return {
      ...item,
      financialStatus: financialStatus || simpleStatus || null,
    };
  });
}