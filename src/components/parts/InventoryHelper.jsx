// Helper functions for inventory calculations

export const getPartReserved = (partId, allAssignments) => {
  return allAssignments
    .filter(a => a.part_id === partId)
    .reduce((sum, a) => sum + (a.qty_needed || 0), 0);
};

export const getPartAvailable = (partId, part, allAssignments) => {
  if (!part) return 0;
  const reserved = getPartReserved(partId, allAssignments);
  return (part.quantity_on_hand || 0) - reserved;
};

export const getPartOnOrder = (partId, allAssignments) => {
  return allAssignments
    .filter(a => a.part_id === partId && a.needed_status === 'On-Order')
    .reduce((sum, a) => sum + (a.qty_needed || 0), 0);
};