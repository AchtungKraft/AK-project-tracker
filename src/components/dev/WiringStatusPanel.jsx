import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { getActionLog } from '@/components/dev/wiringAudit';

/**
 * Dev-only panel showing wiring/debugging status for supply & invoice UIs.
 * Shows: projectId, activeTab, recent audit events, last mutation, invalidation status.
 */
export default function WiringStatusPanel({ 
  projectId, 
  activeTab, 
  lastMutation,
  invalidationFired 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [actionLog, setActionLog] = useState([]);

  // Only show in development
  const isDev = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname.includes('preview') ||
     localStorage.getItem('DEV_WIRING_PANEL') === 'true');

  useEffect(() => {
    if (isOpen) {
      const log = getActionLog();
      setActionLog(log.slice(-10)); // Last 10 events
    }
  }, [isOpen, lastMutation]);

  if (!isDev) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 p-2 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700"
        title="Open Wiring Debug Panel"
      >
        <Bug className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 w-80 bg-gray-900 border border-purple-600/50 rounded-lg shadow-xl text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-purple-900/30">
        <span className="text-purple-300 font-semibold flex items-center gap-1">
          <Bug className="w-4 h-4" /> Wiring Debug
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Context */}
      <div className="p-2 space-y-1 border-b border-gray-700">
        <div className="flex justify-between">
          <span className="text-gray-400">projectId:</span>
          <span className="text-green-400">{projectId || 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">activeTab:</span>
          <span className="text-blue-400">{activeTab || 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">invalidateSupply():</span>
          <span className={invalidationFired ? 'text-green-400' : 'text-yellow-400'}>
            {invalidationFired ? '✓ fired' : '○ not fired'}
          </span>
        </div>
      </div>

      {/* Last Mutation */}
      {lastMutation && (
        <div className="p-2 border-b border-gray-700">
          <div className="text-gray-400 mb-1">Last Mutation:</div>
          <div className={`px-2 py-1 rounded ${lastMutation.success ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
            <div className="font-semibold">{lastMutation.action || 'unknown'}</div>
            <div className="text-xs opacity-80">
              {lastMutation.success ? '✓ success' : `✗ ${lastMutation.error || 'failed'}`}
            </div>
            {lastMutation.timestamp && (
              <div className="text-xs opacity-60">{new Date(lastMutation.timestamp).toLocaleTimeString()}</div>
            )}
          </div>
        </div>
      )}

      {/* Action Log */}
      <div className="p-2 max-h-48 overflow-y-auto">
        <div className="text-gray-400 mb-1">Recent Actions ({actionLog.length}):</div>
        {actionLog.length === 0 ? (
          <div className="text-gray-500 italic">No actions recorded</div>
        ) : (
          <div className="space-y-1">
            {actionLog.map((entry, i) => (
              <div 
                key={i} 
                className={`px-2 py-1 rounded text-xs ${
                  entry.status === 'success' ? 'bg-green-900/20 text-green-300' :
                  entry.status === 'error' ? 'bg-red-900/20 text-red-300' :
                  'bg-gray-800 text-gray-300'
                }`}
              >
                <div className="flex justify-between">
                  <span className="truncate">{entry.action}</span>
                  <span className="opacity-60">{entry.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-700 text-gray-500 text-center">
        DEV ONLY • localStorage.DEV_WIRING_PANEL
      </div>
    </div>
  );
}