import React, { useState, useCallback } from "react";
import MobileScanMoveEntry from "./MobileScanMoveEntry";
import InventoryMoveWorkflow from "../move/InventoryMoveWorkflow";

/**
 * MobileMoveWorkflow — Full-screen mobile scan-first move experience.
 *
 * Steps:
 *   1. SOURCE — Scan or browse to pick where you're moving FROM
 *   2. SELECT + DESTINATION + REVIEW + CONFIRM — Delegated to InventoryMoveWorkflow
 *
 * This is a thin orchestrator. The scan entry feeds a source into the existing
 * InventoryMoveWorkflow which already handles select → destination → review → result
 * with scan + browse destination picking, mobile-friendly layouts, and safe-area padding.
 *
 * Props: same data props as InventoryMoveWorkflow + onClose, onNavigateLocation, onNavigateContainer
 */
export default function MobileMoveWorkflow({
  locations, containers, inventoryItems, parts, projects,
  onClose, onNavigateLocation, onNavigateContainer,
}) {
  const [source, setSource] = useState(null);

  const handleSourceResolved = useCallback((src) => {
    setSource(src);
  }, []);

  const handleMoveClose = useCallback(() => {
    // Return to source scanner — don't fully close
    setSource(null);
  }, []);

  const handleDone = useCallback(() => {
    onClose();
  }, [onClose]);

  // Step 1: Source scanner
  if (!source) {
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col">
        <MobileScanMoveEntry
          locations={locations}
          containers={containers}
          inventoryItems={inventoryItems}
          projects={projects}
          onSourceResolved={handleSourceResolved}
          onClose={onClose}
        />
      </div>
    );
  }

  // Step 2+: Delegate to existing InventoryMoveWorkflow
  return (
    <InventoryMoveWorkflow
      source={source}
      locations={locations}
      containers={containers}
      inventoryItems={inventoryItems}
      parts={parts}
      projects={projects}
      onClose={handleDone}
      onNavigateLocation={onNavigateLocation}
      onNavigateContainer={onNavigateContainer}
    />
  );
}