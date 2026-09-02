import React, { useState, useCallback } from "react";
import QRScanner from "./QRScanner";
import ScanResultPanel from "./ScanResultPanel";
import { resolveStorageScan } from "@/lib/resolveStorageScan";

/**
 * ScannerModal — full-screen scanner experience for Storage.
 * Flow: SCAN → RESOLVE → SHOW RESULT → OPEN / SCAN AGAIN
 *
 * Props:
 *   locations, containers, inventoryItems, projects — live data
 *   onOpenLocation(id)   — navigate to location detail
 *   onOpenContainer(container) — navigate to container detail
 *   onClose()            — dismiss the scanner
 */
export default function ScannerModal({
  locations = [],
  containers = [],
  inventoryItems = [],
  projects = [],
  onOpenLocation,
  onOpenContainer,
  onClose,
}) {
  const [mode, setMode] = useState('scanning'); // scanning | result
  const [scanResult, setScanResult] = useState(null);

  const handleScan = useCallback((decodedText) => {
    const result = resolveStorageScan(decodedText, { locations, containers, inventoryItems });
    setScanResult(result);
    setMode('result');
  }, [locations, containers, inventoryItems]);

  const handleScanAgain = useCallback(() => {
    setScanResult(null);
    setMode('scanning');
  }, []);

  const handleOpenEntity = useCallback((entityType, entityId) => {
    if (entityType === 'LOCATION') {
      onOpenLocation?.(entityId);
    } else if (entityType === 'CONTAINER') {
      const ctr = containers.find(c => c.id === entityId);
      if (ctr) onOpenContainer?.(ctr);
    }
    onClose();
  }, [containers, onOpenLocation, onOpenContainer, onClose]);

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {mode === 'scanning' && (
        <QRScanner
          onScan={handleScan}
          onClose={onClose}
          className="h-full"
        />
      )}
      {mode === 'result' && (
        <ScanResultPanel
          scanResult={scanResult}
          locations={locations}
          containers={containers}
          inventoryItems={inventoryItems}
          projects={projects}
          onOpenEntity={handleOpenEntity}
          onScanAgain={handleScanAgain}
          onBrowse={onClose}
        />
      )}
    </div>
  );
}