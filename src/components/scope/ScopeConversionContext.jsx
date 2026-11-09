import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { computeConversionStatus } from "./scopeConversionStatus";

const ScopeConversionContext = createContext(null);

/** Null outside the provider (client/public views never mount it). */
export function useScopeConversion() {
  return useContext(ScopeConversionContext);
}

/**
 * INTERNAL ONLY. Batched reads: one Task query for all linked ids,
 * one baseline query for the request. No writes.
 */
export function useScopeConversionData({ items, requestId, projectId, enabled }) {
  const linkedIds = useMemo(
    () => [...new Set(items.flatMap(i => i.linked_task_ids || []))].sort(),
    [items]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["scopeConversionStatus", requestId, projectId, linkedIds.join(",")],
    queryFn: async () => {
      const [tasks, baselines] = await Promise.all([
        linkedIds.length ? base44.entities.Task.filter({ id: { $in: linkedIds } }) : [],
        // Link fields only (no estimate amounts); the baseline entity itself is not browser-readable.
        base44.functions.invoke("scopeEstimateBaseline", { action: "conversion_status", requestId, projectId }),
      ]);
      return { tasks, baselines: baselines.data?.baselines || [] };
    },
    enabled: enabled && !!requestId,
    staleTime: 15000,
  });

  return useMemo(() => {
    if (!enabled || !data) return { ready: false, isLoading, byItem: {}, summary: null, projectId };
    return { ready: true, isLoading, projectId, ...computeConversionStatus({ items, ...data, projectId }) };
  }, [enabled, data, items, projectId, isLoading]);
}

export function ScopeConversionProvider({ value, children }) {
  return <ScopeConversionContext.Provider value={value}>{children}</ScopeConversionContext.Provider>;
}