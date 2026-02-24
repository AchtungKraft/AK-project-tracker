import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * useProjectFinancialSnapshot - React hook for canonical financial data
 * 
 * This is the ONLY way UI components should access financial totals.
 * DO NOT compute financial values locally - always use this hook.
 * 
 * Usage:
 *   const { snapshot, isLoading, error, refetch } = useProjectFinancialSnapshot(projectId);
 *   // Use snapshot.canonical.net_exposure, snapshot.canonical.credit_available, etc.
 */

// Query key factory for consistent cache management
export const financialSnapshotKeys = {
  all: ['financial-snapshot'] as const,
  project: (projectId: string) => [...financialSnapshotKeys.all, projectId] as const,
  projectWithDiagnostics: (projectId: string) => [...financialSnapshotKeys.all, projectId, 'diagnostics'] as const,
};

/**
 * Fetch financial snapshot from backend
 */
async function fetchFinancialSnapshot(projectId, includeDiagnostics = false) {
  if (!projectId) {
    return null;
  }

  const response = await base44.functions.invoke("getProjectFinancialSnapshot", {
    project_id: String(projectId),
    include_diagnostics: includeDiagnostics,
  });

  if (!response.data?.success) {
    throw new Error(response.data?.error || "Failed to fetch financial snapshot");
  }

  return response.data;
}

/**
 * Primary hook for financial snapshot
 */
export function useProjectFinancialSnapshot(projectId, options = {}) {
  const {
    includeDiagnostics = false,
    enabled = true,
    staleTime = 30000, // 30 seconds
    ...queryOptions
  } = options;

  const normalizedId = projectId ? String(projectId) : "";

  const query = useQuery({
    queryKey: includeDiagnostics 
      ? financialSnapshotKeys.projectWithDiagnostics(normalizedId)
      : financialSnapshotKeys.project(normalizedId),
    queryFn: () => fetchFinancialSnapshot(normalizedId, includeDiagnostics),
    enabled: enabled && !!normalizedId,
    staleTime,
    ...queryOptions,
  });

  return {
    // Full response
    snapshot: query.data,
    
    // Canonical values (most commonly used)
    canonical: query.data?.canonical ?? null,
    
    // Totals gate status
    totalsGate: query.data?.totals_gate ?? null,
    
    // Diagnostics (if requested)
    diagnostics: query.data?.diagnostics ?? null,
    
    // Query state
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for financial diagnostics (includes full breakdown)
 */
export function useProjectFinancialDiagnostics(projectId, options = {}) {
  return useProjectFinancialSnapshot(projectId, {
    ...options,
    includeDiagnostics: true,
  });
}

/**
 * Helper to format canonical values for display
 */
export function formatCanonicalValue(value, type = 'currency') {
  if (value === null || value === undefined) {
    return '—';
  }

  if (type === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return String(value);
}

/**
 * Validation helper - check if totals gate passes
 */
export function validateTotalsGate(snapshot) {
  if (!snapshot?.totals_gate) {
    return { valid: false, reason: 'No snapshot data' };
  }

  const gate = snapshot.totals_gate;
  
  if (!gate.passes) {
    const failures = [];
    
    if (!gate.invariant_passes) {
      failures.push(`Invariant failed: expected ${gate.expected}, got ${gate.actual} (delta: ${gate.invariant_delta})`);
    }
    
    for (const [check, passes] of Object.entries(gate.sanity_checks || {})) {
      if (!passes) {
        failures.push(`Sanity check failed: ${check}`);
      }
    }
    
    return {
      valid: false,
      reason: failures.join('; '),
      details: gate,
    };
  }

  return { valid: true };
}

export default useProjectFinancialSnapshot;