import { useMemo } from "react";

/**
 * useCommitmentData - Dual-read hook for commitment-based or legacy requirement-based metrics
 * 
 * GUARDRAIL: This hook provides the canonical way to read allocation/ordering metrics.
 * It checks for commitments first, falls back to legacy requirement fields.
 * 
 * @param {Object} params
 * @param {Array} params.commitments - All PartCommitment records
 * @param {Array} params.requirements - All PartProjectRequirement records
 * @param {Array} params.lineItems - All PartPurchaseLineItem records
 * @param {string} params.projectId - Optional filter by project
 * @param {string} params.partId - Optional filter by part
 */
export function useCommitmentData({ 
  commitments = [], 
  requirements = [], 
  lineItems = [],
  projectId = null, 
  partId = null 
}) {
  return useMemo(() => {
    // Filter by project/part if specified
    let filteredCommitments = commitments;
    let filteredRequirements = requirements;
    
    if (projectId) {
      filteredCommitments = filteredCommitments.filter(c => c.project_id === projectId);
      filteredRequirements = filteredRequirements.filter(r => r.project_id === projectId);
    }
    if (partId) {
      filteredCommitments = filteredCommitments.filter(c => c.part_id === partId);
      filteredRequirements = filteredRequirements.filter(r => r.part_id === partId);
    }

    // Check if commitments exist for this scope
    const hasCommitments = filteredCommitments.length > 0;

    if (hasCommitments) {
      // Use commitment-based metrics
      const totalCommitted = filteredCommitments.reduce((sum, c) => sum + (c.qty_committed || 0), 0);
      const totalOrdered = filteredCommitments.reduce((sum, c) => sum + (c.qty_ordered || 0), 0);
      const totalReceived = filteredCommitments.reduce((sum, c) => sum + (c.qty_received || 0), 0);
      const totalAllocated = filteredCommitments.reduce((sum, c) => sum + (c.qty_allocated || 0), 0);
      const totalInstalled = filteredCommitments.reduce((sum, c) => sum + (c.qty_installed || 0), 0);
      const totalCancelled = filteredCommitments.reduce((sum, c) => sum + (c.qty_cancelled || 0), 0);
      
      // On Order = ordered - received
      const onOrder = Math.max(0, totalOrdered - totalReceived);
      
      // Need to Order = committed - installed - allocated - ordered + cancelled adjustments
      const needToOrder = Math.max(0, totalCommitted - totalInstalled - totalAllocated - totalOrdered);

      return {
        source: 'commitments',
        hasCommitments: true,
        commitments: filteredCommitments,
        
        // Metrics
        totalNeeded: totalCommitted,
        totalOrdered,
        totalReceived,
        totalAllocated,
        totalInstalled,
        totalCancelled,
        onOrder,
        needToOrder,
        
        // For individual part/project lookups
        getMetricsForPart: (pId, prjId = null) => {
          const partCommitments = filteredCommitments.filter(c => 
            c.part_id === pId && (prjId ? c.project_id === prjId : true)
          );
          if (partCommitments.length === 0) return null;
          
          const committed = partCommitments.reduce((s, c) => s + (c.qty_committed || 0), 0);
          const ordered = partCommitments.reduce((s, c) => s + (c.qty_ordered || 0), 0);
          const received = partCommitments.reduce((s, c) => s + (c.qty_received || 0), 0);
          const allocated = partCommitments.reduce((s, c) => s + (c.qty_allocated || 0), 0);
          const installed = partCommitments.reduce((s, c) => s + (c.qty_installed || 0), 0);
          
          return {
            source: 'commitments',
            qty_needed: committed,
            qty_ordered: ordered,
            qty_received: received,
            qty_allocated: allocated,
            qty_installed: installed,
            onOrder: Math.max(0, ordered - received),
            needToOrder: Math.max(0, committed - installed - allocated - ordered),
          };
        }
      };
    } else {
      // Fallback to legacy requirement-based metrics
      const totalNeeded = filteredRequirements.reduce((sum, r) => sum + (r.qty_needed || 0), 0);
      const totalAllocated = filteredRequirements.reduce((sum, r) => sum + (r.qty_allocated || 0), 0);
      const totalOrdered = filteredRequirements.reduce((sum, r) => sum + (r.qty_ordered || 0), 0);
      const totalInstalled = filteredRequirements.reduce((sum, r) => sum + (r.qty_installed || 0), 0);
      
      // Calculate on-order from line items (legacy method)
      const partIds = new Set(filteredRequirements.map(r => r.part_id));
      const reqIds = new Set(filteredRequirements.map(r => r.id));
      const relevantLineItems = lineItems.filter(li => 
        partIds.has(li.part_id) || reqIds.has(li.requirement_id)
      );
      const onOrder = relevantLineItems.reduce((sum, li) => 
        sum + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0)), 0
      );
      
      // Need to Order = needed - installed - allocated - ordered
      const needToOrder = filteredRequirements.reduce((sum, r) => 
        sum + Math.max(0, (r.qty_needed || 0) - (r.qty_installed || 0) - (r.qty_allocated || 0) - (r.qty_ordered || 0)), 0
      );

      return {
        source: 'requirements',
        hasCommitments: false,
        commitments: [],
        
        // Metrics
        totalNeeded,
        totalOrdered,
        totalReceived: 0, // Not tracked in legacy
        totalAllocated,
        totalInstalled,
        totalCancelled: 0,
        onOrder,
        needToOrder,
        
        // For individual part/project lookups
        getMetricsForPart: (pId, prjId = null) => {
          const partReqs = filteredRequirements.filter(r => 
            r.part_id === pId && (prjId ? r.project_id === prjId : true)
          );
          if (partReqs.length === 0) return null;
          
          const needed = partReqs.reduce((s, r) => s + (r.qty_needed || 0), 0);
          const ordered = partReqs.reduce((s, r) => s + (r.qty_ordered || 0), 0);
          const allocated = partReqs.reduce((s, r) => s + (r.qty_allocated || 0), 0);
          const installed = partReqs.reduce((s, r) => s + (r.qty_installed || 0), 0);
          
          // On order from line items
          const partLineItems = lineItems.filter(li => li.part_id === pId);
          const partOnOrder = partLineItems.reduce((s, li) => 
            s + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0)), 0
          );
          
          return {
            source: 'requirements',
            qty_needed: needed,
            qty_ordered: ordered,
            qty_received: 0,
            qty_allocated: allocated,
            qty_installed: installed,
            onOrder: partOnOrder,
            needToOrder: Math.max(0, needed - installed - allocated - ordered),
          };
        }
      };
    }
  }, [commitments, requirements, lineItems, projectId, partId]);
}

/**
 * Determines commitment status from quantities
 */
export function deriveCommitmentStatus(commitment) {
  const { qty_committed = 0, qty_ordered = 0, qty_received = 0, qty_allocated = 0, qty_installed = 0, qty_cancelled = 0 } = commitment;
  
  if (qty_cancelled >= qty_committed) return 'cancelled';
  if (qty_installed >= qty_committed) return 'installed';
  if (qty_installed > 0) return 'installed'; // Partial install still counts as installed status
  if (qty_allocated >= qty_committed) return 'allocated';
  if (qty_allocated > 0) return 'allocated';
  if (qty_received >= qty_ordered && qty_ordered > 0) return 'received';
  if (qty_received > 0) return 'partially_received';
  if (qty_ordered > 0) return 'ordered';
  return 'planned';
}

/**
 * Check if a requirement has active commitments (used for write protection)
 */
export function hasActiveCommitments(commitments, requirementId) {
  return commitments.some(c => 
    c.requirement_id === requirementId && 
    c.commitment_status !== 'cancelled' && 
    c.commitment_status !== 'closed'
  );
}

/**
 * Get commitments for a specific requirement
 */
export function getCommitmentsForRequirement(commitments, requirementId) {
  return commitments.filter(c => c.requirement_id === requirementId);
}

/**
 * Get commitments for a specific project + part combination
 */
export function getCommitmentsForProjectPart(commitments, projectId, partId) {
  return commitments.filter(c => c.project_id === projectId && c.part_id === partId);
}