import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 9 — Part Lifecycle Timeline
 * 
 * Returns ordered lifecycle events for a commitment.
 * Used to display the financial timeline in the UI.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { commitment_id } = payload;
    
    if (!commitment_id) {
      return Response.json({ 
        error: 'commitment_id is required',
        code: 'MISSING_COMMITMENT_ID'
      }, { status: 400 });
    }
    
    // Fetch lifecycle events for this commitment
    const events = await base44.entities.LifecycleEvent.filter({ 
      commitment_id: commitment_id 
    });
    
    // Sort by created_date ascending (oldest first)
    events.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    
    // Also fetch related data for context
    const commitment = await base44.entities.PartCommitment.filter({ id: commitment_id });
    const commitmentData = commitment[0];
    
    if (!commitmentData) {
      return Response.json({ 
        error: 'Commitment not found',
        code: 'COMMITMENT_NOT_FOUND'
      }, { status: 404 });
    }
    
    // Fetch part and project for context
    const [parts, projects] = await Promise.all([
      base44.entities.Part.filter({ id: commitmentData.part_id }),
      base44.entities.Project.filter({ id: commitmentData.project_id }),
    ]);
    
    const part = parts[0];
    const project = projects[0];
    
    // If no explicit events exist, build a synthetic timeline from current state
    const timeline = [];
    
    // Add commitment creation as first event
    timeline.push({
      id: 'synthetic-creation',
      event_type: 'COMMITMENT_CREATED',
      timestamp: commitmentData.created_date,
      trigger_source: 'SYSTEM_AUTOMATION',
      notes: `Commitment created for ${commitmentData.qty_committed || 1} x ${part?.part_name || 'Unknown Part'}`,
      previous_state: null,
      new_state: JSON.stringify({
        commitment_status: commitmentData.commitment_status,
        billing_status: commitmentData.billing_status,
      }),
    });
    
    // Add explicit events
    for (const event of events) {
      timeline.push({
        id: event.id,
        event_type: event.event_type,
        timestamp: event.created_date,
        trigger_source: event.trigger_source,
        notes: event.notes,
        previous_state: event.previous_state,
        new_state: event.new_state,
        user_id: event.user_id,
      });
    }
    
    // If billing status indicates progress, add synthetic billing events
    if (commitmentData.billing_status === 'invoiced' || commitmentData.billing_status === 'paid') {
      const invoicedEvent = events.find(e => e.event_type === 'CLIENT_INVOICED');
      if (!invoicedEvent) {
        timeline.push({
          id: 'synthetic-invoiced',
          event_type: 'CLIENT_INVOICED',
          timestamp: commitmentData.updated_date,
          trigger_source: 'SYSTEM_AUTOMATION',
          notes: 'Client invoiced (inferred from status)',
          is_synthetic: true,
        });
      }
    }
    
    if (commitmentData.billing_status === 'paid') {
      const paidEvent = events.find(e => e.event_type === 'CLIENT_PAID');
      if (!paidEvent) {
        timeline.push({
          id: 'synthetic-paid',
          event_type: 'CLIENT_PAID',
          timestamp: commitmentData.updated_date,
          trigger_source: 'SYSTEM_AUTOMATION',
          notes: 'Client payment received (inferred from status)',
          is_synthetic: true,
        });
      }
    }
    
    // Check for orders
    const lineItems = await base44.entities.PartPurchaseLineItem.filter({});
    const partLineItems = lineItems.filter(li => li.part_id === commitmentData.part_id);
    
    if (partLineItems.length > 0) {
      const orders = await base44.entities.Order.filter({});
      const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));
      
      for (const li of partLineItems) {
        const order = ordersMap[li.order_id];
        if (order && ['Ordered', 'Partial', 'Received'].includes(order.status)) {
          const poEvent = events.find(e => e.event_type === 'PO_CREATED');
          if (!poEvent) {
            timeline.push({
              id: `synthetic-po-${li.id}`,
              event_type: 'PO_CREATED',
              timestamp: order.created_date,
              trigger_source: 'SYSTEM_AUTOMATION',
              notes: `Purchase order ${order.po_number || order.id} created`,
              is_synthetic: true,
            });
          }
          
          if (li.qty_received > 0) {
            const receivedEvent = events.find(e => e.event_type === 'PART_RECEIVED');
            if (!receivedEvent) {
              timeline.push({
                id: `synthetic-received-${li.id}`,
                event_type: 'PART_RECEIVED',
                timestamp: order.received_date || order.updated_date,
                trigger_source: 'SYSTEM_AUTOMATION',
                notes: `${li.qty_received} units received`,
                is_synthetic: true,
              });
            }
          }
        }
      }
    }
    
    // Check for installations
    const installedParts = await base44.entities.InstalledPart.filter({
      commitment_id: commitment_id,
    });
    
    if (installedParts.length > 0) {
      for (const ip of installedParts) {
        const installEvent = events.find(e => e.event_type === 'PART_INSTALLED');
        if (!installEvent) {
          timeline.push({
            id: `synthetic-install-${ip.id}`,
            event_type: 'PART_INSTALLED',
            timestamp: ip.installed_date || ip.created_date,
            trigger_source: 'SYSTEM_AUTOMATION',
            notes: `${ip.qty_consumed || 1} units installed`,
            is_synthetic: true,
          });
        }
      }
    }
    
    // Sort final timeline by timestamp
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return Response.json({
      success: true,
      commitment_id,
      part_name: part?.part_name,
      project_name: project?.name,
      timeline,
      event_count: timeline.length,
    });
    
  } catch (error) {
    console.error('Timeline error:', error);
    return Response.json({ 
      error: error.message,
      code: 'TIMELINE_ERROR'
    }, { status: 500 });
  }
});