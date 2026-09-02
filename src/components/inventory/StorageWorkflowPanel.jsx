import React from "react";
import { 
  ArrowDownToLine, ClipboardCheck, PackageOpen, FolderKanban, 
  Package, ShoppingCart, CheckCircle2, Truck, RotateCcw, 
  AlertTriangle, Clock, X, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PutAwayQueue from "./workflows/PutAwayQueue";
import PutAwayQueueList from "./putaway/PutAwayQueueList";
import ProjectStagingView from "./workflows/ProjectStagingView";
import TechnicianCartsView from "./workflows/TechnicianCartsView";
import ReadyToInstallView from "./workflows/ReadyToInstallView";
import ReturnsQueue from "./workflows/ReturnsQueue";
import RecentlyMovedView from "./workflows/RecentlyMovedView";
import ZoneFilteredView from "./workflows/ZoneFilteredView";

const WORKFLOW_META = {
  receiving:      { label: 'Receiving',        icon: ArrowDownToLine,  color: '#22C55E', types: ['receiving'] },
  inspection:     { label: 'Inspection',       icon: ClipboardCheck,   color: '#F59E0B', types: ['inspection'] },
  putAway:        { label: 'Put Away',         icon: PackageOpen,      color: '#8B5CF6' },
  projectStaging: { label: 'Project Staging',  icon: FolderKanban,     color: '#A855F7' },
  warehouse:      { label: 'Warehouse',        icon: Package,          color: '#3B82F6', types: ['warehouse', 'shelf', 'rack', 'bin', 'aisle', 'cabinet', 'drawer'] },
  projectStorage: { label: 'Project Storage',  icon: FolderKanban,     color: '#E879F9', types: ['project_storage', 'project_shelf', 'project_cart', 'engine_stand', 'body_buck', 'parts_tote'] },
  techCarts:      { label: 'Technician Carts', icon: ShoppingCart,     color: '#EF4444' },
  readyToInstall: { label: 'Ready to Install', icon: CheckCircle2,     color: '#10B981' },
  shipping:       { label: 'Shipping',         icon: Truck,            color: '#06B6D4', types: ['shipping'] },
  returns:        { label: 'Returns',          icon: RotateCcw,        color: '#F97316' },
  unassigned:     { label: 'Unassigned',       icon: AlertTriangle,    color: '#EAB308' },
  recentlyMoved:  { label: 'Recently Moved',   icon: Clock,            color: '#94A3B8' },
};

/**
 * StorageWorkflowPanel — renders the active workflow view.
 * Receives the workflow key and all shared data props.
 */
export default function StorageWorkflowPanel({ 
  workflowKey, locations, inventoryItems, parts, projects, commitments,
  onClose, onNavigateLocation 
}) {
  const meta = WORKFLOW_META[workflowKey];
  if (!meta) return null;
  const HeaderIcon = meta.icon;

  const renderWorkflow = () => {
    const sharedProps = { locations, inventoryItems, parts, projects, commitments, onNavigateLocation };

    switch (workflowKey) {
      case 'putAway':
        return <PutAwayQueue {...sharedProps} />;
      case 'projectStaging':
        return <ProjectStagingView {...sharedProps} />;
      case 'techCarts':
        return <TechnicianCartsView {...sharedProps} />;
      case 'readyToInstall':
        return <ReadyToInstallView {...sharedProps} />;
      case 'returns':
        return <ReturnsQueue {...sharedProps} />;
      case 'recentlyMoved':
        return <RecentlyMovedView locations={locations} parts={parts} onNavigateLocation={onNavigateLocation} />;
      case 'receiving':
      case 'inspection':
      case 'warehouse':
      case 'projectStorage':
      case 'shipping':
        return (
          <ZoneFilteredView
            {...sharedProps}
            zoneTypes={meta.types}
            zoneLabel={meta.label}
            zoneIcon={meta.icon}
            zoneColor={meta.color}
          />
        );
      case 'unassigned':
        // Redirect to the tree's unassigned view 
        return <PutAwayQueue {...sharedProps} />;
      default:
        return <div className="text-gray-500 text-center py-8">Unknown workflow</div>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Workflow Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-red-900/20 bg-gray-900/40 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-8 w-8 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: meta.color + '20' }}>
          <HeaderIcon className="w-4 h-4" style={{ color: meta.color }} />
        </div>
        <h3 className="text-base font-semibold text-white">{meta.label}</h3>
      </div>

      {/* Workflow Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderWorkflow()}
      </div>
    </div>
  );
}