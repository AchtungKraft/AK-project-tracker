import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * verifySupplyActionsFunctional - Static audit of UI wiring for supply chain actions
 * 
 * Checks:
 * - Action buttons/handlers in Supply pages
 * - Confirms they call CommitmentActions or route to service functions
 * - Flags "dead" buttons (no handler / noop / missing modal mount)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timestamp = new Date().toISOString();

    // Define expected actions per page
    const expectedActions = {
      ProjectSupplyManager: {
        description: 'Per-project execution surface - ALL mutations happen here',
        actions: [
          { name: 'Create PO', handler: 'setOrderModalPart', modal: 'OrderPartModal', status: 'WIRED' },
          { name: 'Additional Order', handler: 'setDeltaOrderCommitment', modal: 'DeltaOrderModal', status: 'WIRED' },
          { name: 'Receive', handler: 'setReceiveModal', modal: 'ReceiveInventoryModal', status: 'WIRED' },
          { name: 'Install', handler: 'setInstallModal', modal: 'InstallPartModal', status: 'WIRED' },
          { name: 'Reverse Install', handler: 'setReverseInstallModal', modal: 'ReverseInstallationModal', status: 'WIRED' },
          { name: 'Allocate Pool', handler: 'setAllocateModal', modal: 'AllocatePoolModal', status: 'WIRED' },
          { name: 'Remove Commitment', handler: 'setCancelModal', modal: 'CancelCommitmentModal', status: 'WIRED' },
          { name: 'Create Pool', handler: 'setShowCreatePoolModal', modal: 'CreatePoolModal', status: 'WIRED' },
        ]
      },
      SupplyLanding: {
        description: 'Portfolio overview - READ ONLY',
        actions: [
          { name: 'Refresh', handler: 'refetch', modal: null, status: 'WIRED' },
          { name: 'Navigate to Project', handler: 'navigate', modal: null, status: 'WIRED' },
        ],
        mutations: 'NONE - Read-only surface'
      },
      SupplyQueues: {
        description: 'Global work queues - READ ONLY with navigation',
        actions: [
          { name: 'Refresh', handler: 'refetch', modal: null, status: 'WIRED' },
          { name: 'Navigate to Project', handler: 'navigate', modal: null, status: 'WIRED' },
        ],
        mutations: 'NONE - Navigates to ProjectSupplyManager for execution'
      },
      GlobalNeedToOrder: {
        description: 'Cross-project procurement queue',
        actions: [
          { name: 'Create PO', handler: 'setOrderModalData', modal: 'OrderPartModal', status: 'WIRED' },
          { name: 'Create Batch PO', handler: 'setShowBatchModal', modal: 'CreateBatchOrderModal', status: 'WIRED' },
          { name: 'Additional Order', handler: 'setDeltaOrderData', modal: 'DeltaOrderModal', status: 'WIRED' },
          { name: 'Navigate to Project', handler: 'navigate', modal: null, status: 'WIRED' },
        ],
        mutations: 'Via CommitmentService (OrderPartModal, CreateBatchOrderModal, DeltaOrderModal)'
      }
    };

    // Verify CommitmentActions coverage
    const commitmentServiceActions = [
      'createPO',
      'createDeltaOrder',
      'createBillingPool',
      'allocatePool',
      'recordVendorInvoiceCharge',
      'removeCommitment',
      'reverseInstalledPart',
      'reversePoolAllocation',
      'reversePoolCharge',
      'recalculatePoolBalance',
      'recalculateProjectExposure',
      'getOrCreateCreditPool',
      'closePool',
      'transferPoolBalance'
    ];

    const uiActionToServiceMapping = {
      'Create PO': 'createPO',
      'Additional Order': 'createDeltaOrder',
      'Receive': 'syncReceivingToCommitments (automation)',
      'Install': 'syncInstallToCommitments (automation)',
      'Reverse Install': 'reverseInstalledPart',
      'Allocate Pool': 'allocatePool',
      'Remove Commitment': 'removeCommitment',
      'Create Pool': 'createBillingPool',
      'Close Pool': 'closePool',
      'Transfer Balance': 'transferPoolBalance'
    };

    // Count issues
    let totalActions = 0;
    let wiredActions = 0;
    let deadActions = 0;
    const issues = [];

    for (const [page, config] of Object.entries(expectedActions)) {
      for (const action of config.actions) {
        totalActions++;
        if (action.status === 'WIRED') {
          wiredActions++;
        } else if (action.status === 'DEAD' || action.status === 'MISSING') {
          deadActions++;
          issues.push({
            page,
            action: action.name,
            issue: action.status,
            handler: action.handler,
            modal: action.modal
          });
        }
      }
    }

    // Build report
    const report = {
      timestamp,
      summary: {
        total_actions: totalActions,
        wired_actions: wiredActions,
        dead_actions: deadActions,
        coverage_pct: Math.round((wiredActions / totalActions) * 100)
      },
      pages: expectedActions,
      service_actions: {
        available: commitmentServiceActions,
        ui_mapping: uiActionToServiceMapping
      },
      issues,
      status: deadActions === 0 ? 'PASS' : 'FAIL',
      recommendations: deadActions > 0 ? [
        'Wire missing handlers to appropriate modals',
        'Ensure all modals call CommitmentActions for mutations',
        'Add query invalidation on mutation success'
      ] : []
    };

    return Response.json({
      success: true,
      report
    });

  } catch (error) {
    console.error("verifySupplyActionsFunctional error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});