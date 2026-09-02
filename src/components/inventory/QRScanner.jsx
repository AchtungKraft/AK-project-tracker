import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { X, Zap, ZapOff, RefreshCw, SwitchCamera, AlertTriangle, CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * QRScanner — one reusable camera-based QR scanner for all Storage workflows.
 *
 * Props:
 *   onScan(decodedText)  — called once per valid decode, then scanning pauses
 *   onClose()            — cancel / dismiss
 *   className            — optional wrapper class
 */
export default function QRScanner({ onScan, onClose, className }) {
  const scannerRef = useRef(null);
  const containerRef = useRef(null);
  const [status, setStatus] = useState('initializing'); // initializing | scanning | paused | error
  const [error, setError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [activeCameraIdx, setActiveCameraIdx] = useState(0);
  const lastScanRef = useRef(null);

  const startScanner = useCallback(async (cameraIdx) => {
    // Clean up previous instance
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (_) {}
      try { scannerRef.current.clear(); } catch (_) {}
      scannerRef.current = null;
    }

    setStatus('initializing');
    setError(null);

    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setStatus('error');
        setError('No camera found on this device');
        return;
      }
      setCameras(devices);

      // Prefer rear/environment camera
      let selectedIdx = cameraIdx ?? 0;
      if (cameraIdx == null) {
        const rearIdx = devices.findIndex(d =>
          /back|rear|environment/i.test(d.label)
        );
        if (rearIdx >= 0) selectedIdx = rearIdx;
        else if (devices.length > 1) selectedIdx = devices.length - 1; // last is usually rear
      }
      setActiveCameraIdx(selectedIdx);

      const scanner = new Html5Qrcode("qr-scanner-viewport", { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        devices[selectedIdx].id,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Debounce: ignore same code within 3s
          if (lastScanRef.current === decodedText) return;
          lastScanRef.current = decodedText;

          // Pause scanning on valid result
          scanner.pause(true);
          setStatus('paused');
          onScan(decodedText);

          // Reset debounce after 3s
          setTimeout(() => { lastScanRef.current = null; }, 3000);
        },
        () => {} // ignore QR not found frames
      );

      setStatus('scanning');

      // Check torch support
      try {
        const track = scanner.getRunningTrackCameraCapabilities?.();
        if (track && track.torchFeature?.().isSupported?.()) {
          setTorchSupported(true);
        }
      } catch (_) {
        setTorchSupported(false);
      }
    } catch (err) {
      setStatus('error');
      if (err?.message?.includes('Permission') || err?.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access and try again.');
      } else if (err?.name === 'NotFoundError') {
        setError('No camera found on this device');
      } else if (err?.name === 'NotReadableError') {
        setError('Camera is in use by another app');
      } else {
        setError(err?.message || 'Failed to start camera');
      }
    }
  }, [onScan]);

  // Start on mount
  useEffect(() => {
    startScanner(null);
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch (_) {}
        try { scannerRef.current.clear(); } catch (_) {}
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScanAgain = useCallback(() => {
    lastScanRef.current = null;
    if (scannerRef.current && status === 'paused') {
      try {
        scannerRef.current.resume();
        setStatus('scanning');
      } catch (_) {
        startScanner(activeCameraIdx);
      }
    } else {
      startScanner(activeCameraIdx);
    }
  }, [status, activeCameraIdx, startScanner]);

  const handleToggleTorch = useCallback(async () => {
    if (!scannerRef.current || !torchSupported) return;
    try {
      const track = scannerRef.current.getRunningTrackCameraCapabilities();
      const torch = track.torchFeature();
      if (torchOn) {
        await torch.disable();
      } else {
        await torch.enable();
      }
      setTorchOn(!torchOn);
    } catch (_) {}
  }, [torchOn, torchSupported]);

  const handleSwitchCamera = useCallback(() => {
    if (cameras.length < 2) return;
    const nextIdx = (activeCameraIdx + 1) % cameras.length;
    setTorchOn(false);
    setTorchSupported(false);
    startScanner(nextIdx);
  }, [cameras, activeCameraIdx, startScanner]);

  // ── ERROR STATE ──
  if (status === 'error') {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-black p-6 text-center", className)}>
        <div className="w-20 h-20 rounded-full bg-red-950/50 flex items-center justify-center mb-4">
          {error?.includes('permission') || error?.includes('Permission')
            ? <CameraOff className="w-10 h-10 text-red-400" />
            : <AlertTriangle className="w-10 h-10 text-red-400" />
          }
        </div>
        <p className="text-white text-lg font-bold mb-2">Camera Unavailable</p>
        <p className="text-gray-400 text-sm mb-6 max-w-xs">{error}</p>
        <div className="flex gap-3">
          <Button onClick={() => startScanner(null)} variant="outline" className="gap-2 border-gray-600 text-gray-300">
            <RefreshCw className="w-4 h-4" /> Try Again
          </Button>
          <Button onClick={onClose} variant="ghost" className="text-gray-400">
            Browse Storage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-black", className)}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur z-10 shrink-0">
        <span className="text-white font-bold text-lg">Scan QR</span>
        <div className="flex items-center gap-2">
          {torchSupported && (
            <Button size="icon" variant="ghost" onClick={handleToggleTorch}
              className={cn("h-10 w-10", torchOn ? "text-yellow-400" : "text-gray-400")}>
              {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
            </Button>
          )}
          {cameras.length > 1 && (
            <Button size="icon" variant="ghost" onClick={handleSwitchCamera} className="h-10 w-10 text-gray-400">
              <SwitchCamera className="w-5 h-5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} className="h-10 w-10 text-gray-400">
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden" ref={containerRef}>
        <div id="qr-scanner-viewport" className="w-full h-full" />

        {/* Scanning overlay — crosshair guide */}
        {status === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-white/30 rounded-2xl relative">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-red-500 rounded-tl-lg" style={{ borderWidth: '3px 0 0 3px' }} />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-red-500 rounded-tr-lg" style={{ borderWidth: '3px 3px 0 0' }} />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-red-500 rounded-bl-lg" style={{ borderWidth: '0 0 3px 3px' }} />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-red-500 rounded-br-lg" style={{ borderWidth: '0 3px 3px 0' }} />
            </div>
          </div>
        )}

        {/* Initializing spinner */}
        {status === 'initializing' && (
          <div className="absolute inset-0 bg-black flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-gray-600 border-t-red-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Bottom bar — always visible, large touch targets */}
      <div className="px-4 py-4 bg-black/90 backdrop-blur shrink-0 space-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        {status === 'scanning' && (
          <p className="text-center text-gray-400 text-sm">Point camera at a QR code</p>
        )}
        {status === 'paused' && (
          <Button onClick={handleScanAgain} className="w-full h-12 text-base gap-2 bg-red-600 hover:bg-red-700">
            <RefreshCw className="w-5 h-5" /> Scan Again
          </Button>
        )}
        <Button onClick={onClose} variant="outline" className="w-full h-12 text-base border-gray-600 text-gray-300">
          Cancel
        </Button>
      </div>
    </div>
  );
}