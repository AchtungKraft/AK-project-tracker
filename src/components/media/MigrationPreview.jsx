import React, { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, CheckCircle2, AlertTriangle, ArrowRight, Copy, Search,
  FileText, Database, Replace, XCircle, RefreshCw, Eye
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const MATCH_TYPE_LABELS = {
  array_element: 'URL in array',
  exact_string: 'Exact field match',
  text_contains: 'URL in text/HTML',
};

const ENTITY_COLORS = {
  Project: 'bg-blue-900/50 text-blue-300',
  Part: 'bg-purple-900/50 text-purple-300',
  Comment: 'bg-gray-700 text-gray-300',
  TaskComment: 'bg-gray-700 text-gray-300',
  JournalEntry: 'bg-indigo-900/50 text-indigo-300',
  ClientFeedbackAttachment: 'bg-cyan-900/50 text-cyan-300',
  ClientFeedbackComment: 'bg-cyan-900/50 text-cyan-300',
  ClientFeedbackRequest: 'bg-cyan-900/50 text-cyan-300',
  ClientFeedbackDecision: 'bg-cyan-900/50 text-cyan-300',
  BuildKnowledgeItem: 'bg-amber-900/50 text-amber-300',
  BuildKnowledgeProjectNote: 'bg-amber-900/50 text-amber-300',
  ProcedureEntry: 'bg-amber-900/50 text-amber-300',
  EmailTemplate: 'bg-green-900/50 text-green-300',
  Task: 'bg-red-900/50 text-red-300',
};

/**
 * Step 2 of Replace Asset Everywhere:
 * Scans for references, shows migration preview, confirms & executes.
 */
export default function MigrationPreview({ open, onClose, migrationData, onComplete }) {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open && migrationData) {
      setScanResult(null);
      setResult(null);
      runScan();
    }
  }, [open, migrationData?.oldUrl]);

  const runScan = async () => {
    if (!migrationData) return;
    setScanning(true);
    setScanResult(null);

    const response = await base44.functions.invoke('scanMediaReferences', {
      mode: 'scan',
      old_url: migrationData.oldUrl,
      new_url: migrationData.newUrl,
    });

    setScanResult(response.data);
    setScanning(false);
  };

  const executeMigration = async () => {
    if (!migrationData || !scanResult) return;
    setExecuting(true);

    const response = await base44.functions.invoke('scanMediaReferences', {
      mode: 'migrate',
      old_url: migrationData.oldUrl,
      new_url: migrationData.newUrl,
      old_asset_id: migrationData.oldAsset?.id,
      new_asset_id: migrationData.newAsset?.id,
    });

    setResult(response.data);
    setExecuting(false);

    // Invalidate ALL relevant caches so UI views refresh with new URLs
    invalidateAllCaches();

    if (response.data.records_failed === 0) {
      toast.success(`Migration complete — ${response.data.records_modified} record(s) updated and verified`);
    } else {
      toast.warning(`Migration partial — ${response.data.records_failed} record(s) failed`);
    }
  };

  const invalidateAllCaches = () => {
    // Media assets
    queryClient.invalidateQueries({ queryKey: ['mediaAssets'] });

    // Client feedback queries (internal detail page)
    queryClient.invalidateQueries({ queryKey: ['internalFeedbackDetail'] });

    // Client feedback queries (public client portal)
    queryClient.invalidateQueries({ queryKey: ['clientRequestDetail'] });

    // Client portal hub
    queryClient.invalidateQueries({ queryKey: ['clientPortalHubData'] });

    // Client portal data
    queryClient.invalidateQueries({ queryKey: ['clientPortalData'] });

    // Project detail queries
    queryClient.invalidateQueries({ queryKey: ['projectDetail'] });
    queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] });

    // Feedback-related entity queries
    queryClient.invalidateQueries({ queryKey: ['clientFeedbackDecisions'] });

    // Knowledge base queries
    queryClient.invalidateQueries({ queryKey: ['buildKnowledge'] });

    // Broad invalidation for any query containing feedback-related keys
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (!Array.isArray(key)) return false;
        const keyStr = JSON.stringify(key).toLowerCase();
        return keyStr.includes('feedback') ||
               keyStr.includes('comment') ||
               keyStr.includes('attachment') ||
               keyStr.includes('decision') ||
               keyStr.includes('journal') ||
               keyStr.includes('knowledge');
      },
    });
  };

  const handleClose = () => {
    if (result) {
      onComplete?.();
    }
    onClose();
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('Copied');
  };

  if (!migrationData) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-orange-400" />
            Replace Asset Everywhere — Migration Preview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL Comparison */}
          <UrlComparison
            oldUrl={migrationData.oldUrl}
            newUrl={migrationData.newUrl}
            oldAsset={migrationData.oldAsset}
            newAsset={migrationData.newAsset}
            onCopy={copyUrl}
          />

          {/* Scanning state */}
          {scanning && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-3 text-orange-400 animate-spin" />
              <p className="text-sm text-gray-400">Scanning all entities for references...</p>
              <p className="text-xs text-gray-600 mt-1">Project, Part, JournalEntry, Comment, Knowledge, Feedback, Decisions, Task...</p>
            </div>
          )}

          {/* Scan results — preview */}
          {scanResult && !result && (
            <ScanResultsPreview
              scanResult={scanResult}
              onConfirm={executeMigration}
              executing={executing}
              onRescan={runScan}
            />
          )}

          {/* Migration result */}
          {result && (
            <MigrationResult result={result} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="border-gray-600">
            {result ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UrlComparison({ oldUrl, newUrl, oldAsset, newAsset, onCopy }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-2">
        <label className="text-[9px] text-red-400 uppercase tracking-wider font-semibold">Old (will be superseded)</label>
        <div className="mt-1 aspect-video bg-gray-950 rounded overflow-hidden flex items-center justify-center">
          <img src={oldUrl} alt="Old" className="max-w-full max-h-full object-contain" />
        </div>
        <div className="mt-1 flex items-center gap-1">
          <code className="text-[9px] text-red-300/70 flex-1 break-all line-clamp-2">{oldUrl}</code>
          <button onClick={() => onCopy(oldUrl)} className="text-gray-600 hover:text-white flex-shrink-0">
            <Copy className="w-3 h-3" />
          </button>
        </div>
        {oldAsset && <p className="text-[9px] text-gray-600 mt-0.5">{oldAsset.file_name}</p>}
      </div>
      <div className="bg-gray-800/50 rounded-lg border border-green-800/50 p-2">
        <label className="text-[9px] text-green-400 uppercase tracking-wider font-semibold">New (replacement)</label>
        <div className="mt-1 aspect-video bg-gray-950 rounded overflow-hidden flex items-center justify-center">
          <img src={newUrl} alt="New" className="max-w-full max-h-full object-contain" />
        </div>
        <div className="mt-1 flex items-center gap-1">
          <code className="text-[9px] text-green-300/70 flex-1 break-all line-clamp-2">{newUrl}</code>
          <button onClick={() => onCopy(newUrl)} className="text-gray-600 hover:text-white flex-shrink-0">
            <Copy className="w-3 h-3" />
          </button>
        </div>
        {newAsset && <p className="text-[9px] text-gray-600 mt-0.5">{newAsset.file_name}</p>}
      </div>
    </div>
  );
}

function ScanResultsPreview({ scanResult, onConfirm, executing, onRescan }) {
  const matches = scanResult.matches || [];

  if (matches.length === 0) {
    return (
      <div className="space-y-3">
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 text-center">
          <Search className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p className="text-sm text-gray-400">No references found for this URL.</p>
          <p className="text-xs text-gray-600 mt-1">The old URL is not referenced in any entity records.</p>
        </div>
        <Button onClick={onRescan} variant="outline" size="sm" className="border-gray-600 gap-2">
          <Search className="w-3.5 h-3.5" /> Re-scan
        </Button>
      </div>
    );
  }

  // Group by entity
  const grouped = {};
  matches.forEach(m => {
    if (!grouped[m.entity]) grouped[m.entity] = [];
    grouped[m.entity].push(m);
  });

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-3 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-orange-300 font-medium">
            Found {scanResult.total_references} reference(s) across {scanResult.total_records} record(s)
          </p>
          <p className="text-xs text-orange-400/70 mt-0.5">Review each match below before confirming.</p>
        </div>
      </div>

      {/* Matches grouped by entity */}
      <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-1">
        {Object.entries(grouped).map(([entity, entityMatches]) => (
          <div key={entity} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
              <Badge className={ENTITY_COLORS[entity] || 'bg-gray-700 text-gray-300'}>
                {entity}
              </Badge>
              <span className="text-xs text-gray-500">{entityMatches.length} record(s)</span>
            </div>
            <div className="divide-y divide-gray-800">
              {entityMatches.map((match, idx) => (
                <div key={idx} className="px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="text-xs text-gray-200 font-medium truncate">{match.record_name}</span>
                    <span className="text-[10px] text-gray-600 font-mono">.{match.field}</span>
                    <Badge variant="outline" className="text-[9px] border-gray-600 text-gray-500 ml-auto">
                      {MATCH_TYPE_LABELS[match.match_type] || match.match_type}
                      {match.match_count > 1 && ` ×${match.match_count}`}
                    </Badge>
                  </div>
                  {/* Before/After for text_contains matches */}
                  {match.match_type === 'text_contains' && match.before_value && (
                    <div className="ml-5 space-y-0.5">
                      <div className="bg-red-950/30 rounded px-2 py-1">
                        <code className="text-[9px] text-red-300/80 break-all">{match.before_value}</code>
                      </div>
                      <div className="flex justify-center"><ArrowRight className="w-3 h-3 text-gray-700" /></div>
                      <div className="bg-green-950/30 rounded px-2 py-1">
                        <code className="text-[9px] text-green-300/80 break-all">{match.after_value}</code>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm */}
      <div className="space-y-2 pt-2 border-t border-gray-700">
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5 text-xs text-red-300/90">
          <strong>This will:</strong>
          <ul className="mt-1 space-y-0.5 list-disc list-inside text-red-300/70">
            <li>Replace the old URL with the new URL in {scanResult.total_records} record(s)</li>
            <li>Mark the old MediaAsset as <strong>superseded</strong></li>
            <li>Create a MediaAssetMigration audit record</li>
            <li>Verify each update by re-reading the modified record</li>
          </ul>
          <p className="mt-1 text-red-400/80">This cannot be automatically undone.</p>
        </div>
        <Button
          onClick={onConfirm}
          disabled={executing}
          className="bg-red-600 hover:bg-red-700 gap-2 w-full"
        >
          {executing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Executing Migration...</>
          ) : (
            <><Replace className="w-4 h-4" /> Confirm — Replace in {scanResult.total_records} Record(s)</>
          )}
        </Button>
      </div>
    </div>
  );
}

function MigrationResult({ result }) {
  const isFullSuccess = result.records_failed === 0 && (result.records_unverified || 0) === 0;
  const verifiedCount = result.records_verified || 0;
  const unverifiedCount = result.records_unverified || 0;

  // Separate details by status
  const failedDetails = (result.details || []).filter(d => d.status === 'failed');
  const unverifiedDetails = (result.details || []).filter(d => d.status === 'unverified');

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-4 text-center ${
        isFullSuccess
          ? 'bg-green-900/20 border-green-700/50'
          : 'bg-yellow-900/20 border-yellow-700/50'
      }`}>
        {isFullSuccess ? (
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
        ) : (
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
        )}
        <p className={`text-lg font-semibold ${isFullSuccess ? 'text-green-300' : 'text-yellow-300'}`}>
          Migration {isFullSuccess ? 'Complete' : 'Partial'}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <ResultStat label="Records Updated" value={result.records_modified} color="text-blue-400" />
        <ResultStat label="Verified" value={verifiedCount} color="text-green-400" />
        <ResultStat label="Failed" value={result.records_failed} color={result.records_failed > 0 ? "text-red-400" : "text-gray-500"} />
        <ResultStat label="Old Asset" value="Superseded" color="text-yellow-400" />
      </div>

      {result.records_failed > 0 && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5 text-xs text-red-300 space-y-1">
          <div className="flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            <span className="font-medium">{result.records_failed} record(s) failed to update:</span>
          </div>
          {failedDetails.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2 ml-5">
              <Badge className={ENTITY_COLORS[d.entity] || 'bg-gray-700 text-gray-300'} style={{ fontSize: '9px' }}>
                {d.entity}
              </Badge>
              <span className="text-red-300/80">{d.record_name}.{d.field}</span>
              {d.error && <span className="text-red-400/60 text-[9px]">({d.error})</span>}
            </div>
          ))}
        </div>
      )}

      {unverifiedCount > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2.5 text-xs text-yellow-300 space-y-1">
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">{unverifiedCount} record(s) updated but verification uncertain:</span>
          </div>
          {unverifiedDetails.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2 ml-5">
              <Badge className={ENTITY_COLORS[d.entity] || 'bg-gray-700 text-gray-300'} style={{ fontSize: '9px' }}>
                {d.entity}
              </Badge>
              <span className="text-yellow-300/80">{d.record_name}.{d.field}</span>
            </div>
          ))}
        </div>
      )}

      {result.details && result.details.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-3">
          <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Modified Records</h4>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {result.details.map((d, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                {d.status === 'verified' && <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />}
                {d.status === 'unverified' && <AlertTriangle className="w-3 h-3 text-yellow-500 flex-shrink-0" />}
                {d.status === 'failed' && <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                <Badge className={ENTITY_COLORS[d.entity] || 'bg-gray-700 text-gray-300'} style={{ fontSize: '9px' }}>
                  {d.entity}
                </Badge>
                <span className="text-gray-300 truncate">{d.record_name}</span>
                <span className="text-gray-600 font-mono">.{d.field}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.migration_id && (
        <p className="text-[10px] text-gray-600 text-center">
          Migration ID: {result.migration_id}
        </p>
      )}
    </div>
  );
}

function ResultStat({ label, value, color }) {
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}