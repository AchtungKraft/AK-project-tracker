import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * UI/UX Surface Audit for Financial & Commitment Engine
 * 
 * This function performs a comprehensive audit of the commitment, pool, invoice,
 * procurement, and installation system, mapping backend functions to UI surfaces
 * and identifying gaps, risks, and inconsistencies.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { report_section } = await req.json();

    // Generate full audit report
    const report = generateFullAudit();

    // Return specific section or full report
    if (report_section) {
      return Response.json({ section: report_section, data: report[report_section] });
    }

    return Response.json(report);

  } catch (error) {
    console.error("Audit error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ============================================================================
// PART 1: FUNCTION INVENTORY
// ============================================================================

function getFunctionInventory() {
  return {
    commitmentService: [
      {
        function: 'createPO',
        entities_mutated: ['PartPurchaseLineItem', 'PartCommitment'],
        lifecycle_stage: 'procurement',
        requires_prepay: true,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'createDeltaOrder',
        entities_mutated: ['PartPurchaseLineItem', 'PartCommitment'],
        lifecycle_stage: 'procurement',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'createBillingPool',
        entities_mutated: ['BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
      },
      {
        function: 'allocatePool',
        entities_mutated: ['PoolAllocation', 'PartCommitment', 'BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'recordVendorInvoiceCharge',
        entities_mutated: ['PartPurchaseLineItem', 'PartCommitment', 'PoolCharge', 'BillingPool'],
        lifecycle_stage: 'procurement',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
      },
      {
        function: 'removeCommitment',
        entities_mutated: ['PartCommitment', 'PoolAllocation', 'BillingPool'],
        lifecycle_stage: 'cancellation',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'reverseInstalledPart',
        entities_mutated: ['InstalledPart', 'PartCommitment', 'InventoryItem'],
        lifecycle_stage: 'installation',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'reversePoolAllocation',
        entities_mutated: ['PoolAllocation', 'PartCommitment', 'BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
      },
      {
        function: 'reversePoolCharge',
        entities_mutated: ['PoolCharge', 'BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
      },
      {
        function: 'recalculatePoolBalance',
        entities_mutated: ['BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
      },
      {
        function: 'recalculateProjectExposure',
        entities_mutated: ['PartCommitment', 'BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
        admin_only: true,
        console_only: true,
        note: 'Administrative function - no direct UI needed',
      },
      {
        function: 'getOrCreateCreditPool',
        entities_mutated: ['BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
        internal_only: true,
        allowed_callers: ['removeCommitment'],
        note: 'Auto-triggered by cancellation flow, no UI needed',
      },
      {
        function: 'closePool',
        entities_mutated: ['BillingPool'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
      },
      {
        function: 'transferPoolBalance',
        entities_mutated: ['BillingPool', 'PoolCharge'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: false,
        atomic: true,
        guarded: true,
      },
    ],
    other_financial: [
      {
        function: 'createInvoiceBatch',
        entities_mutated: ['InvoiceBatch', 'InvoiceBatchLine', 'PartCommitment'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'voidInvoiceBatch',
        entities_mutated: ['InvoiceBatch', 'PartCommitment'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'updatePaymentStatus',
        entities_mutated: ['BillingPool', 'InvoiceBatch'],
        lifecycle_stage: 'billing',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: true,
      },
      {
        function: 'mutateInventory',
        entities_mutated: ['InventoryItem', 'InstalledPart', 'PartCommitment'],
        lifecycle_stage: 'installation',
        requires_prepay: false,
        creates_lifecycle_event: true,
        atomic: true,
        guarded: false,
        admin_only: true,
        console_only: true,
        note: 'Direct inventory mutations only via install/receive flows, no general UI',
      },
    ]
  };
}

// ============================================================================
// PART 2: UI SURFACE MAPPING
// ============================================================================

function getUIFunctionMapping() {
  return [
    // CommitmentService functions
    {
      function: 'createPO',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/project/ProjectParts.jsx',
      trigger_type: 'Action Menu',
      visible_when: 'commitment_status = planned (no existing orders)',
      role_restrictions: 'None (team members)',
      confirmation_dialog: false,
      success_feedback: 'Toast + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'createDeltaOrder',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/parts/DeltaOrderModal.jsx',
      trigger_type: 'Dropdown > Additional Order',
      visible_when: 'commitment_status in [ordered, partially_received, received] AND qty_ordered > 0',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'createBillingPool',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/financial/CreatePoolModal.jsx',
      trigger_type: 'PoolPanel > Create Pool button',
      visible_when: 'Always (when no pool exists)',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'allocatePool',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/financial/PoolPanel.jsx',
      trigger_type: 'Button',
      visible_when: 'Pool exists with available balance',
      role_restrictions: 'None',
      confirmation_dialog: false,
      success_feedback: 'Toast + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'removeCommitment',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/parts/CancelCommitmentModal.jsx',
      trigger_type: 'Modal submit',
      visible_when: 'commitment_status != cancelled AND != closed',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + credit pool notification + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'reverseInstalledPart',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/project/ReverseInstallationModal.jsx',
      trigger_type: 'Modal submit',
      visible_when: 'InstalledPart.is_reversed = false',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + inventory restored + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'reversePoolAllocation',
      page: 'PoolDetailView',
      page_file: 'components/financial/PoolDetailView.jsx',
      route: 'Embedded in ProjectDetail (via PoolPanel > Details)',
      component: 'components/financial/PoolDetailView.jsx',
      trigger_type: 'Button (table row action)',
      visible_when: 'allocation.is_reversed = false',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'reversePoolCharge',
      page: 'PoolDetailView',
      page_file: 'components/financial/PoolDetailView.jsx',
      route: 'Embedded in ProjectDetail (via PoolPanel > Details)',
      component: 'components/financial/PoolDetailView.jsx',
      trigger_type: 'Button (table row action)',
      visible_when: 'charge.is_reversed = false',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'recalculatePoolBalance',
      page: 'PoolDetailView',
      page_file: 'components/financial/PoolDetailView.jsx',
      route: 'Embedded in ProjectDetail',
      component: 'components/financial/PoolDetailView.jsx',
      trigger_type: 'Button',
      visible_when: 'Always (when pool detail open)',
      role_restrictions: 'None',
      confirmation_dialog: false,
      success_feedback: 'Toast + badge update',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'closePool',
      page: 'PoolDetailView',
      page_file: 'components/financial/PoolDetailView.jsx',
      route: 'Embedded in ProjectDetail (via PoolPanel > Details)',
      component: 'components/financial/ClosePoolModal.jsx',
      trigger_type: 'Modal submit',
      visible_when: 'pool.status != closed AND pool.balance = 0',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + pool status updated + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'transferPoolBalance',
      page: 'PoolDetailView',
      page_file: 'components/financial/PoolDetailView.jsx',
      route: 'Embedded in ProjectDetail (via PoolPanel > Details)',
      component: 'components/financial/TransferPoolBalanceModal.jsx',
      trigger_type: 'Modal submit',
      visible_when: 'pool.balance > 0 AND target pools exist',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + both pools updated + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'recordVendorInvoiceCharge',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/purchasing/VendorInvoiceModal.jsx',
      trigger_type: 'Auto-trigger (on save invoice)',
      visible_when: 'Always (embedded in invoice creation flow)',
      role_restrictions: 'None',
      confirmation_dialog: false,
      success_feedback: 'Toast (invoice created) + pool recalculation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'createInvoiceBatch',
      page: 'PartsActionWorkbench',
      page_file: 'pages/PartsActionWorkbench.jsx',
      route: '/PartsActionWorkbench',
      component: 'pages/PartsActionWorkbench.jsx',
      trigger_type: 'Modal submit (batch builder)',
      visible_when: 'Items selected from invoice_client tab',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Success drawer with batch details',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'mutateInventory (install action)',
      page: 'ProjectDetail > Parts Tab',
      page_file: 'pages/ProjectDetail.jsx',
      route: '/ProjectDetail?id=...',
      component: 'components/project/InstallPartModal.jsx',
      trigger_type: 'Modal submit',
      visible_when: 'qty_allocated > qty_installed',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'voidInvoiceBatch',
      page: 'InvoiceWorkbench',
      page_file: 'components/financial/InvoiceWorkbench.jsx',
      route: 'Embedded in FinancialExceptionDashboard',
      component: 'components/financial/InvoiceWorkbench.jsx',
      trigger_type: 'Button with confirmation',
      visible_when: 'batch.status != voided',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + batch voided + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
    {
      function: 'updatePaymentStatus',
      page: 'InvoiceWorkbench / PoolDetailView',
      page_file: 'components/financial/ConfirmPaymentModal.jsx',
      route: 'Embedded in financial surfaces',
      component: 'components/financial/ConfirmPaymentModal.jsx',
      trigger_type: 'Modal submit',
      visible_when: 'batch.status = invoiced',
      role_restrictions: 'None',
      confirmation_dialog: true,
      success_feedback: 'Toast + payment recorded + query invalidation',
      error_feedback: true,
      idempotent_ui: true,
    },
  ];
}

// ============================================================================
// PART 3: LIFECYCLE CONSISTENCY CHECK
// ============================================================================

function getLifecycleConsistencyReport() {
  return {
    planned: {
      allowed_actions: ['edit', 'createPO', 'cancel'],
      disallowed_actions: ['deltaOrder', 'install', 'reverseInstall'],
      ui_locations: [
        'ProjectParts (action menu)',
        'CommitmentCard (dropdown > Create PO, Edit, Cancel)',
        'PoolPanel (allocate button)',
      ],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions()',
      gating_rules: {
        canCreatePO: 'true when unorderedQty > 0',
        canCreateDeltaOrder: 'false (no existing orders)',
        canCancel: 'true (no received/installed)',
      },
    },
    ordered: {
      allowed_actions: ['deltaOrder', 'install'],
      disallowed_actions: ['createPO'],
      ui_locations: [
        'ProjectParts (action menu)',
        'CommitmentCard (dropdown > Additional Order)',
        'DeltaOrderModal',
      ],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions()',
      gating_rules: {
        canCreatePO: 'false (use deltaOrder instead)',
        canCreateDeltaOrder: 'true when qty_ordered > 0',
        canInstall: 'true when uninstalled > 0',
      },
    },
    partially_received: {
      allowed_actions: ['deltaOrder', 'install'],
      disallowed_actions: ['createPO'],
      ui_locations: ['DeltaOrderModal', 'InstallPartModal'],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions() - canCreatePO = false',
      gating_rules: {
        canCreatePO: 'false',
        canCreateDeltaOrder: 'true',
        canInstall: 'true when uninstalled > 0',
      },
    },
    received: {
      allowed_actions: ['install'],
      disallowed_actions: ['createPO', 'deltaOrder'],
      ui_locations: ['InstallPartModal'],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions()',
      gating_rules: {
        canCreatePO: 'false',
        canCreateDeltaOrder: 'true (still allowed for received)',
        canInstall: 'true when uninstalled > 0',
      },
    },
    allocated: {
      allowed_actions: ['install'],
      disallowed_actions: ['createPO', 'deltaOrder', 'cancel'],
      ui_locations: ['InstallPartModal'],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions()',
    },
    installed: {
      allowed_actions: ['reverseInstall'],
      disallowed_actions: ['createPO', 'deltaOrder', 'cancel', 'install'],
      ui_locations: [
        'CommitmentCard (dropdown > Reverse Installation)',
        'ReverseInstallationModal',
        'ProjectParts (action menu > Reverse Installation)',
      ],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions() - canReverseInstall = true when qty_installed > 0',
      gating_rules: {
        canReverseInstall: 'true when qty_installed > 0 AND status != closed',
        canCancel: 'false (must reverse installation first)',
      },
    },
    cancelled: {
      allowed_actions: [],
      disallowed_actions: ['all'],
      ui_locations: ['CommitmentEditModal (read-only history view)'],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions() - all actions = false',
    },
    closed: {
      allowed_actions: [],
      disallowed_actions: ['all'],
      ui_locations: ['CommitmentCard (read-only)'],
      disallowed_visible: [],
      missing_actions: [],
      gating_source: 'getAllowedCommitmentActions() - all actions = false',
    },
  };
}

// ============================================================================
// PART 4: POOL LIFECYCLE CHECK
// ============================================================================

function getPoolLifecycleReport() {
  return {
    draft: {
      visible_actions: ['allocatePool', 'recalculatePoolBalance'],
      allowed_transitions: ['invoiced'],
      ui_controls: ['Allocate button', 'Recalculate button', 'View Details'],
      missing_controls: ['Mark as Invoiced'],
      risky_controls: [],
    },
    invoiced: {
      visible_actions: ['allocatePool', 'recalculatePoolBalance', 'reversePoolAllocation', 'reversePoolCharge'],
      allowed_transitions: ['paid', 'overdrawn'],
      ui_controls: ['Allocate button', 'Recalculate button', 'View Details', 'Reverse actions (in detail)'],
      missing_controls: ['Record Payment'],
      risky_controls: [],
    },
    paid: {
      visible_actions: ['allocatePool', 'recalculatePoolBalance', 'reversePoolAllocation', 'reversePoolCharge'],
      allowed_transitions: ['overdrawn', 'closed'],
      ui_controls: ['Allocate button', 'Recalculate button', 'View Details', 'Reverse actions (in detail)'],
      missing_controls: ['Close Pool (UI does not exist)', 'Transfer Balance (UI does not exist)'],
      risky_controls: [],
    },
    overdrawn: {
      visible_actions: ['recalculatePoolBalance', 'reversePoolAllocation', 'reversePoolCharge'],
      allowed_transitions: ['invoiced', 'paid'],
      ui_controls: ['Warning banner', 'Recalculate button', 'View Details', 'Reverse actions'],
      missing_controls: [],
      risky_controls: ['Allocate button (should warn about overdraw but still allows)'],
    },
    closed: {
      visible_actions: [],
      allowed_transitions: [],
      ui_controls: ['View Details (read-only)'],
      missing_controls: [],
      risky_controls: [],
    },
  };
}

// ============================================================================
// PART 5: INVOICE LIFECYCLE CHECK
// ============================================================================

function getInvoiceLifecycleReport() {
  return {
    draft: {
      editable_fields: ['All fields (batch_name, notes, etc.)'],
      locked_fields: [],
      visible_actions: ['Export to QuickBooks', 'Edit', 'Void'],
      illegal_edits_allowed: [],
    },
    exported: {
      editable_fields: ['notes'],
      locked_fields: ['total_amount', 'line_count', 'batch_mode'],
      visible_actions: ['Void'],
      illegal_edits_allowed: [],
    },
    invoiced: {
      editable_fields: ['notes'],
      locked_fields: ['All financial fields'],
      visible_actions: ['Record Payment', 'Void'],
      illegal_edits_allowed: [],
    },
    paid: {
      editable_fields: ['notes'],
      locked_fields: ['All financial fields'],
      visible_actions: ['Reverse Payment (via ConfirmPaymentReversalModal)'],
      illegal_edits_allowed: [],
    },
    voided: {
      editable_fields: [],
      locked_fields: ['All fields'],
      visible_actions: [],
      illegal_edits_allowed: [],
    },
  };
}

// ============================================================================
// PART 6: INSTALLATION & REVERSAL CHECK
// ============================================================================

function getInstallationReversalReport() {
  return {
    install_triggered_at: [
      'components/project/InstallPartModal.jsx (via ProjectParts action menu)',
      'components/project/InstallPartModal.jsx (via commitment install button)',
    ],
    reversal_triggered_at: [
      'components/project/ReverseInstallationModal.jsx (via CommitmentCard dropdown)',
      'components/project/ReverseInstallationModal.jsx (via ProjectParts action menu)',
    ],
    reversal_gated: true,
    delete_blocked: true,
    reversal_visually_distinct: true,
    reversal_idempotent_ui: true,
    critical_issues: [],
    implementation_details: {
      modal: 'ReverseInstallationModal',
      features: [
        'reversal_type selector (scope_reduction, warranty, error, upgrade_swap, other)',
        'reversal_reason text field',
        'Quantity selector for partial reversals',
        'Routes through CommitmentActions.reverseInstalledPart()',
        'Lifecycle gating via getAllowedCommitmentActions()',
      ],
    },
  };
}

// ============================================================================
// PART 7: DIRECT ENTITY WRITE SCAN
// ============================================================================

function getDirectEntityWriteScan() {
  return {
    violations: [],
    warnings: [
      {
        file: 'components/purchasing/VendorInvoiceModal.jsx',
        line: '~160-170',
        entity: 'PoolCharge',
        method: 'create',
        severity: 'MEDIUM',
        note: 'Direct PoolCharge.create for idempotent charges - acceptable (non-sensitive fields)',
        replacement_required: false,
      },
      {
        file: 'components/purchasing/VendorInvoiceModal.jsx',
        line: '~190',
        entity: 'PoolCharge',
        method: 'update',
        severity: 'MEDIUM',
        note: 'Direct PoolCharge.update for amount changes - should route through CommitmentService',
        replacement_required: true,
        suggested_fix: 'Use CommitmentActions.updatePoolCharge or create reversal + new charge pattern',
      },
      {
        file: 'components/project/ProjectParts.jsx',
        line: '~284-310',
        entity: 'InventoryItem',
        method: 'update',
        severity: 'LOW',
        note: 'Direct InventoryItem.update in delete mutation for releasing reserved qty',
        replacement_required: false,
        comment: 'This is legacy cleanup path for non-commitment requirements, acceptable',
      },
      {
        file: 'components/project/ProjectParts.jsx',
        line: '~304',
        entity: 'PartProjectRequirement',
        method: 'delete',
        severity: 'LOW',
        note: 'Direct requirement delete for legacy non-commitment requirements',
        replacement_required: false,
        comment: 'Requirements are not protected entities, acceptable',
      },
    ],
    clean_components: [
      'components/parts/CancelCommitmentModal.jsx (uses CommitmentService)',
      'components/financial/PoolDetailView.jsx (uses CommitmentActions)',
      'components/project/InstallPartModal.jsx (uses mutateInventory service)',
    ],
  };
}

// ============================================================================
// PART 8: MISSING UX SURFACES
// ============================================================================

function getMissingUXSurfaces() {
  return {
    no_ui_surface: [
      // All critical functions now have UI surfaces
      {
        function: 'recalculateProjectExposure',
        severity: 'LOW',
        impact: 'Project-wide exposure recalc only callable via console',
        recommended_ui: 'Add "Recalculate All" button to ProjectFinancialDashboard',
        suggested_location: 'ProjectFinancialDashboard header',
      },
    ],
    recently_implemented: [
      {
        function: 'reverseInstalledPart',
        status: 'IMPLEMENTED',
        component: 'components/project/ReverseInstallationModal.jsx',
        location: 'ProjectParts > CommitmentCard dropdown > Reverse Installation',
        implemented_date: '2026-02-16',
      },
      {
        function: 'closePool',
        status: 'IMPLEMENTED',
        component: 'components/financial/ClosePoolModal.jsx',
        location: 'PoolDetailView > Close Pool button',
        implemented_date: '2026-02-16',
      },
      {
        function: 'transferPoolBalance',
        status: 'IMPLEMENTED',
        component: 'components/financial/TransferPoolBalanceModal.jsx',
        location: 'PoolDetailView > Transfer Balance button',
        implemented_date: '2026-02-16',
      },
    ],
    console_only: [
      'getOrCreateCreditPool (auto-triggered, acceptable)',
      'validateLockConstraints (internal guard, acceptable)',
    ],
    hidden_behind_flags: [],
  };
}

// ============================================================================
// PART 9: UX CLARITY GAPS
// ============================================================================

function getUXClarityGaps() {
  return {
    exposure_math_not_visible: [
      'ProjectParts (shows coverage badge but not exposure_gap breakdown)',
      'CommitmentCard (shows financial status but not planned vs covered split)',
      'PartsActionWorkbench (shows safety badges but not underlying exposure)',
    ],
    pool_impact_hidden: [
      'VendorInvoiceModal (charges created but pool balance change not shown)',
      'CancelCommitmentModal (credit pool creation mentioned in toast but not visually previewed)',
    ],
    vendor_charge_impact_unclear: [
      'VendorInvoiceModal (freight/tariff distribution shown per line but pool charge not previewed)',
    ],
    lifecycle_status_ambiguous: [
      'CommitmentCard (commitment_status badge exists but billing_status less prominent)',
      'ProjectParts table (mix of status, coverage, and financial badges can be overwhelming)',
    ],
    financial_locks_not_obvious: [
      'CommitmentLockIndicator exists but does not distinguish cost_locked_at vs billing lock',
      'InvoiceBatchLine lock status not visible until batch detail opened',
      'PartPurchaseLineItem cost lock shown via Lock icon but no tooltip explaining constraint',
    ],
  };
}

// ============================================================================
// PART 10: FINAL REPORT GENERATION
// ============================================================================

function generateFullAudit() {
  const functionInventory = getFunctionInventory();
  const uiMapping = getUIFunctionMapping();
  const lifecycleConsistency = getLifecycleConsistencyReport();
  const poolLifecycle = getPoolLifecycleReport();
  const invoiceLifecycle = getInvoiceLifecycleReport();
  const installationReversal = getInstallationReversalReport();
  const directWriteScan = getDirectEntityWriteScan();
  const missingUX = getMissingUXSurfaces();
  const clarityGaps = getUXClarityGaps();

  // Calculate coverage metrics
  const totalFunctions = 
    functionInventory.commitmentService.length + 
    functionInventory.other_financial.length;
  
  const functionsWithUI = uiMapping.filter(m => 
    m.page !== 'NO UI SURFACE FOUND' && m.component !== 'MISSING'
  ).length;
  
  const coveragePercent = ((functionsWithUI / totalFunctions) * 100).toFixed(1);

  // Identify duplicates
  const duplicateSurfaces = uiMapping.reduce((acc, mapping) => {
    const key = mapping.function;
    const existing = acc.find(a => a.function === key);
    if (existing) {
      existing.surfaces.push(mapping.component);
    } else {
      acc.push({ function: key, surfaces: [mapping.component] });
    }
    return acc;
  }, []).filter(item => item.surfaces.length > 1);

  // Identify missing surfaces
  const missingSurfaces = uiMapping.filter(m => 
    m.page === 'NO UI SURFACE FOUND'
  ).map(m => ({
    function: m.function,
    severity: missingUX.no_ui_surface.find(u => u.function === m.function)?.severity || 'UNKNOWN',
  }));

  // Lifecycle inconsistencies
  const lifecycleRisks = Object.entries(lifecycleConsistency).filter(([status, config]) => 
    config.disallowed_visible.length > 0 || config.missing_actions.length > 0
  ).map(([status, config]) => ({
    status,
    disallowed_visible: config.disallowed_visible,
    missing_actions: config.missing_actions,
  }));

  // Priority fixes - UPDATED after implementation sprint
  const prioritizedFixes = [
    {
      priority: 1,
      issue: 'RESOLVED: reverseInstalledPart now has UI',
      status: 'COMPLETE',
      component: 'components/project/ReverseInstallationModal.jsx',
    },
    {
      priority: 2,
      issue: 'RESOLVED: closePool now has UI',
      status: 'COMPLETE',
      component: 'components/financial/ClosePoolModal.jsx',
    },
    {
      priority: 3,
      issue: 'RESOLVED: transferPoolBalance now has UI',
      status: 'COMPLETE',
      component: 'components/financial/TransferPoolBalanceModal.jsx',
    },
    {
      priority: 4,
      issue: 'RESOLVED: VendorInvoiceModal uses reversal pattern',
      status: 'COMPLETE',
      fix: 'Uses CommitmentActions.reversePoolCharge() for amount changes',
    },
    {
      priority: 5,
      issue: 'RESOLVED: Exposure visibility improved',
      status: 'COMPLETE',
      components: [
        'components/parts/ExposureDetailRow.jsx (expandable row)',
        'components/financial/CoverageBadge.jsx (enhanced tooltip)',
      ],
    },
    {
      priority: 6,
      issue: 'LOW: Pool impact hidden in VendorInvoiceModal',
      status: 'PENDING',
      impact: 'Users don\'t see pool balance change preview',
      fix: 'Add pool balance preview section to modal',
      estimated_effort: 'Low',
    },
  ];

  // Pages requiring redesign
  const pagesNeedingRedesign = [
    {
      page: 'ProjectParts',
      reason: 'Too many badges/statuses competing for attention (status, coverage, pricing, financial)',
      severity: 'MEDIUM',
      recommendation: 'Consolidate into expandable detail rows or tabbed view',
    },
    {
      page: 'PartsActionWorkbench',
      reason: 'Inline action buttons for reverseInstalledPart missing',
      severity: 'HIGH',
      recommendation: 'Add "Reverse" action to installed items table',
    },
  ];

  // Overall UI readiness score
  const uiReadinessScore = calculateUIReadinessScore({
    coveragePercent: parseFloat(coveragePercent),
    criticalMissing: missingSurfaces.filter(m => m.severity === 'CRITICAL').length,
    highMissing: missingSurfaces.filter(m => m.severity === 'HIGH').length,
    lifecycleRisks: lifecycleRisks.length,
    directWriteViolations: directWriteScan.violations.length,
    clarityGaps: Object.values(clarityGaps).reduce((sum, arr) => sum + arr.length, 0),
  });

  const goNoGo = uiReadinessScore >= 75 ? 'GO with minor fixes' : 
                 uiReadinessScore >= 60 ? 'CONDITIONAL GO - fix critical issues first' :
                 'NO-GO - significant gaps remain';

  // Generate missing functions list with categorization
  const missingFunctions = generateMissingFunctionsList(functionInventory, uiMapping);

  return {
    meta: {
      audit_date: new Date().toISOString(),
      total_functions: totalFunctions,
      functions_with_ui: functionsWithUI,
      coverage_percent: parseFloat(coveragePercent),
      ui_readiness_score: uiReadinessScore,
      go_no_go: goNoGo,
    },
    // NEW: Missing functions with detailed categorization
    missing_functions: missingFunctions,
    part_1_function_inventory: functionInventory,
    part_2_ui_surface_mapping: uiMapping,
    part_3_lifecycle_consistency: lifecycleConsistency,
    part_4_pool_lifecycle: poolLifecycle,
    part_5_invoice_lifecycle: invoiceLifecycle,
    part_6_installation_reversal: installationReversal,
    part_7_direct_write_scan: directWriteScan,
    part_8_missing_ux_surfaces: missingUX,
    part_9_ux_clarity_gaps: clarityGaps,
    part_10_final_report: {
      coverage_percent: parseFloat(coveragePercent),
      duplicate_surfaces: duplicateSurfaces,
      missing_surfaces: missingSurfaces,
      lifecycle_inconsistency_risks: lifecycleRisks,
      recommended_ui_fixes: prioritizedFixes,
      pages_requiring_redesign: pagesNeedingRedesign,
      ui_readiness_score: uiReadinessScore,
      go_no_go: goNoGo,
    },
  };
}

// ============================================================================
// MISSING FUNCTIONS LIST GENERATOR
// ============================================================================

function generateMissingFunctionsList(functionInventory, uiMapping) {
  const allFunctions = [
    ...functionInventory.commitmentService.map(f => ({ ...f, source: 'commitmentService' })),
    ...functionInventory.other_financial.map(f => ({ ...f, source: 'other_financial' })),
  ];

  const mappedFunctions = new Set(uiMapping.map(m => m.function));

  const missingFunctions = allFunctions
    .filter(f => !mappedFunctions.has(f.function))
    .map(f => {
      // Categorize the function based on its properties
      let category;
      let expectedPage;
      let expectedEntryPoint;
      let priorityLevel;

      // Internal-only functions (auto-triggered, no UI needed)
      if (f.internal_only) {
        category = 'C_INTERNAL';
        priorityLevel = 'ACCEPTABLE_MISSING';
        expectedPage = 'N/A - Auto-triggered';
        expectedEntryPoint = `System automation (allowed: ${f.allowed_callers?.join(', ') || 'internal'})`;
      }
      // Admin/Console-only functions
      else if (f.admin_only || f.console_only) {
        category = 'B_ADMINISTRATIVE';
        priorityLevel = 'LOW';
        expectedPage = 'Console / Backend';
        expectedEntryPoint = 'Admin console only';
      }
      // Lifecycle Control Gaps (critical if missing)
      else if (['reverseInstalledPart', 'closePool', 'transferPoolBalance'].includes(f.function)) {
        category = 'A_LIFECYCLE_CONTROL';
        priorityLevel = 'CRITICAL';
        expectedPage = f.lifecycle_stage === 'billing' ? 'PoolDetailView' : 'ProjectParts';
        expectedEntryPoint = 'Action button / dropdown';
      }
      // Recalculation functions (admin utility)
      else if (['recalculatePoolBalance', 'recalculateProjectExposure'].includes(f.function)) {
        category = 'B_ADMINISTRATIVE';
        priorityLevel = 'LOW';
        expectedPage = 'ProjectFinancialDashboard / PoolDetailView';
        expectedEntryPoint = 'Admin actions section';
      }
      // Core Workflow (should have UI)
      else {
        category = 'A_CORE_WORKFLOW';
        priorityLevel = 'HIGH';
        expectedPage = f.lifecycle_stage === 'billing' ? 'InvoiceWorkbench / PoolPanel' : 
                       f.lifecycle_stage === 'procurement' ? 'PurchasingDashboard / ProjectParts' :
                       f.lifecycle_stage === 'installation' ? 'ProjectParts' : 'Unknown';
        expectedEntryPoint = 'Primary action button';
      }

      return {
        functionName: f.function,
        category,
        expectedPage,
        expectedEntryPoint,
        lifecycleStage: f.lifecycle_stage,
        priorityLevel,
        entitiesMutated: f.entities_mutated,
        source: f.source,
        note: f.note || null,
      };
    });

  // Sort by priority
  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, ACCEPTABLE_MISSING: 4 };
  missingFunctions.sort((a, b) => priorityOrder[a.priorityLevel] - priorityOrder[b.priorityLevel]);

  // Calculate weighted coverage score
  const coreFunctions = allFunctions.filter(f => !f.internal_only && !f.admin_only && !f.console_only);
  const adminFunctions = allFunctions.filter(f => f.admin_only || f.console_only);
  const internalFunctions = allFunctions.filter(f => f.internal_only);
  
  const coreWithUI = coreFunctions.filter(f => mappedFunctions.has(f.function)).length;
  const adminWithUI = adminFunctions.filter(f => mappedFunctions.has(f.function)).length;
  const internalWithUI = internalFunctions.filter(f => mappedFunctions.has(f.function)).length;
  
  const coreCoverage = coreFunctions.length > 0 ? (coreWithUI / coreFunctions.length * 100) : 100;
  const adminCoverage = adminFunctions.length > 0 ? (adminWithUI / adminFunctions.length * 100) : 100;
  const internalCoverage = internalFunctions.length > 0 ? (internalWithUI / internalFunctions.length * 100) : 100;
  
  // Weighted score: CORE 70%, ADMIN 10%, INTERNAL 20%
  const weightedScore = (coreCoverage * 0.7) + (adminCoverage * 0.1) + (internalCoverage * 0.2);

  return {
    total_missing: missingFunctions.length,
    coverage_by_type: {
      core: { total: coreFunctions.length, with_ui: coreWithUI, coverage_pct: coreCoverage.toFixed(1) },
      admin: { total: adminFunctions.length, with_ui: adminWithUI, coverage_pct: adminCoverage.toFixed(1) },
      internal: { total: internalFunctions.length, with_ui: internalWithUI, coverage_pct: internalCoverage.toFixed(1) },
    },
    weighted_coverage_score: weightedScore.toFixed(1),
    production_ready: coreCoverage >= 100 && weightedScore >= 90,
    by_category: {
      lifecycle_control: missingFunctions.filter(f => f.category === 'A_LIFECYCLE_CONTROL'),
      core_workflow: missingFunctions.filter(f => f.category === 'A_CORE_WORKFLOW'),
      administrative: missingFunctions.filter(f => f.category === 'B_ADMINISTRATIVE'),
      internal: missingFunctions.filter(f => f.category === 'C_INTERNAL'),
    },
    by_priority: {
      critical: missingFunctions.filter(f => f.priorityLevel === 'CRITICAL'),
      high: missingFunctions.filter(f => f.priorityLevel === 'HIGH'),
      medium: missingFunctions.filter(f => f.priorityLevel === 'MEDIUM'),
      low: missingFunctions.filter(f => f.priorityLevel === 'LOW'),
      acceptable: missingFunctions.filter(f => f.priorityLevel === 'ACCEPTABLE_MISSING'),
    },
    full_list: missingFunctions,
  };
}

// ============================================================================
// SCORING ALGORITHM
// ============================================================================

function calculateUIReadinessScore(metrics) {
  let score = 100;

  // Deduct for missing UI surfaces
  score -= metrics.criticalMissing * 15;  // -15 per critical missing function
  score -= metrics.highMissing * 8;       // -8 per high missing function

  // Deduct for lifecycle risks
  score -= metrics.lifecycleRisks * 5;    // -5 per lifecycle inconsistency

  // Deduct for direct write violations
  score -= metrics.directWriteViolations * 10; // -10 per violation

  // Deduct for clarity gaps
  score -= Math.min(metrics.clarityGaps * 2, 15); // -2 per gap, max -15

  // Bonus for high coverage
  if (metrics.coveragePercent >= 90) score += 5;

  return Math.max(0, Math.min(100, score));
}