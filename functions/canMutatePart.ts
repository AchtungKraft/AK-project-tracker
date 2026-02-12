import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CENTRALIZED PART MUTATION PERMISSION CHECK
 * 
 * Determines if a part can undergo a specific mutation type.
 * Used by mutateInventory, UI selection lists, and task allocation logic.
 * 
 * Returns: { allowed: boolean, reason?: string, code?: string }
 */

const PART_TYPE_DEFAULTS = {
  PURCHASED_VENDOR: { 
    requires_vendor_purchase: true, 
    affects_inventory: true,
    can_receive: true,
    can_move: true,
    can_install: true,
  },
  AK_MANUFACTURED: { 
    requires_vendor_purchase: false, 
    affects_inventory: true,
    can_receive: true,
    can_move: true,
    can_install: true,
  },
  CLIENT_SUPPLIED: { 
    requires_vendor_purchase: false, 
    affects_inventory: false,
    can_receive: true, // Can receive from client
    can_move: true,
    can_install: true,
  },
  TAKE_OFF: { 
    requires_vendor_purchase: false, 
    affects_inventory: true,
    can_receive: true, // Receive from vehicle
    can_move: true,
    can_install: true,
  },
  STOCK_AK: { 
    requires_vendor_purchase: true, 
    affects_inventory: true,
    can_receive: true,
    can_move: true,
    can_install: true,
  },
  WARRANTY_REPLACEMENT: { 
    requires_vendor_purchase: false, 
    affects_inventory: true,
    can_receive: true,
    can_move: true,
    can_install: true,
  },
};

function getPartTypeBehavior(partType) {
  return PART_TYPE_DEFAULTS[partType] || PART_TYPE_DEFAULTS.PURCHASED_VENDOR;
}

function checkMutationPermission(part, mutation_type, options = {}) {
  const result = { allowed: true };
  
  // Check archived status
  if (part.is_archived) {
    return {
      allowed: false,
      reason: 'Cannot perform operations on archived parts',
      code: 'PART_ARCHIVED',
    };
  }
  
  // Check active status
  if (part.is_active === false) {
    return {
      allowed: false,
      reason: 'Part is not active',
      code: 'PART_INACTIVE',
    };
  }
  
  const behavior = getPartTypeBehavior(part.part_type);
  
  // Check mutation-specific permissions
  switch (mutation_type) {
    case 'receive':
      if (!behavior.can_receive) {
        return {
          allowed: false,
          reason: `Part type ${part.part_type} cannot be received`,
          code: 'PART_TYPE_CANNOT_RECEIVE',
        };
      }
      // CLIENT_SUPPLIED cannot receive from vendor orders
      if (part.part_type === 'CLIENT_SUPPLIED' && options.source_type === 'vendor_order') {
        return {
          allowed: false,
          reason: 'Client-supplied parts cannot be received from vendor orders',
          code: 'INVALID_SOURCE_FOR_PART_TYPE',
        };
      }
      break;
      
    case 'move':
      if (!behavior.can_move) {
        return {
          allowed: false,
          reason: `Part type ${part.part_type} cannot be moved`,
          code: 'PART_TYPE_CANNOT_MOVE',
        };
      }
      break;
      
    case 'install':
      if (!behavior.can_install) {
        return {
          allowed: false,
          reason: `Part type ${part.part_type} cannot be installed`,
          code: 'PART_TYPE_CANNOT_INSTALL',
        };
      }
      break;
      
    case 'reversal':
      // Reversals are always allowed if not archived
      break;
      
    case 'adjustment':
      // Adjustments are always allowed if not archived
      break;
      
    default:
      return {
        allowed: false,
        reason: `Unknown mutation type: ${mutation_type}`,
        code: 'INVALID_MUTATION_TYPE',
      };
  }
  
  // Add behavior info to result
  result.behavior = behavior;
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload = {};
    try {
      payload = await req.json();
    } catch (e) {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    
    const { part_id, mutation_type, options = {} } = payload;

    if (!part_id) {
      return Response.json({ error: 'part_id is required' }, { status: 400 });
    }
    if (!mutation_type) {
      return Response.json({ error: 'mutation_type is required' }, { status: 400 });
    }

    // Fetch part
    const parts = await base44.asServiceRole.entities.Part.filter({ id: part_id });
    const part = parts[0];
    
    if (!part) {
      return Response.json({ 
        allowed: false, 
        reason: 'Part not found',
        code: 'PART_NOT_FOUND'
      });
    }

    const result = checkMutationPermission(part, mutation_type, options);
    
    return Response.json({
      ...result,
      part_id,
      mutation_type,
      part_type: part.part_type,
      is_archived: part.is_archived || false,
    });

  } catch (error) {
    console.error('canMutatePart error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

export { checkMutationPermission, getPartTypeBehavior };