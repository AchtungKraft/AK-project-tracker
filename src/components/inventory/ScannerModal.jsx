import { useState, useCallback } from "react";
import QRScanner from "./QRScanner";
import ScanResultPanel from "./ScanResultPanel";
import ReservedStorageLabelActivation from "./ReservedStorageLabelActivation";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { parseQRPayload, resolveStorageScan } from "@/lib/resolveStorageScan";

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
  onDocumentContainer,
  intent = 'browse',
  onClose,
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('scanning'); // scanning | resolving | reserved | result
  const [scanResult, setScanResult] = useState(null);
  const [reservedContainer, setReservedContainer] = useState(null);

  const handleScan = useCallback(async (decodedText) => {
    const result = resolveStorageScan(decodedText, { locations, containers, inventoryItems });
    const parsed = parseQRPayload(decodedText);
    if (parsed?.type === 'CONTAINER' && !result.valid && result.error === 'Container no longer exists') {
      // Reserved labels are intentionally excluded from the regular active container list.
      setMode('resolving');
      try {
        const response = await base44.functions.invoke('storageLabels',{action:'lookup',qr_value:decodedText});
        const data = response?.data || response;
        if (data.error || !data.success) throw new Error(data.error || 'Label could not be resolved');
        if (data.reserved) {
          setReservedContainer(data.container);
          setMode('reserved');
          return;
        }
        setScanResult({raw:decodedText,entity_type:'CONTAINER',entity_id:data.container.id,entity:data.container,valid:true,error:null});
      } catch (e) {
        setScanResult({...result,error:e.message || 'Failed to resolve container'});
      }
      setMode('result');
      return;
    }
    setScanResult(result);
    setMode('result');
  }, [locations, containers, inventoryItems]);

  const handleScanAgain = useCallback(() => {
    setScanResult(null);
    setReservedContainer(null);
    setMode('scanning');
  }, []);

  const handleOpenEntity = useCallback((entityType, entityId) => {
    if (entityType === 'LOCATION') {
      onOpenLocation?.(entityId);
    } else if (entityType === 'CONTAINER') {
      const ctr = containers.find(c => c.id === entityId) || (scanResult?.entity_id === entityId ? scanResult.entity : null);
      if (ctr) onOpenContainer?.(ctr);
    }
    onClose();
  }, [containers, scanResult, onOpenLocation, onOpenContainer, onClose]);

  // Dedicated documented-property path; never routes to InventoryItem receiving
  // or modifies the box, Parts catalogue, quantities, or commitments.
  const handleDocumentContainer = useCallback((entityId) => {
    const container = containers.find(c => c.id === entityId) ||
      (scanResult?.entity_id === entityId ? scanResult.entity : null);
    if (!container?.id) return;
    onDocumentContainer?.(container);
    onClose();
  }, [containers, scanResult, onDocumentContainer, onClose]);

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {mode === 'scanning' && (
        <QRScanner
          onScan={handleScan}
          onClose={onClose}
          className="h-full"
        />
      )}
      {mode === 'resolving' && (
        <div className="flex-1 flex items-center justify-center text-gray-300 gap-3">
          <Loader2 className="w-5 h-5 animate-spin"/> Checking label…
        </div>
      )}
      {mode === 'reserved' && reservedContainer && (
        <ReservedStorageLabelActivation
          container={reservedContainer} locations={locations} projects={projects}
          onCancel={handleScanAgain}
          onActivated={(container) => {
            queryClient.invalidateQueries({queryKey:['storageContainers']});
            if (intent === 'document' && onDocumentContainer) onDocumentContainer(container);
            else onOpenContainer?.(container);
            onClose();
          }}
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
          onDocumentContainer={onDocumentContainer ? handleDocumentContainer : undefined}
          preferredAction={intent}
          onScanAgain={handleScanAgain}
          onBrowse={onClose}
        />
      )}
    </div>
  );
}