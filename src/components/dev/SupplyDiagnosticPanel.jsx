/**
 * SupplyDiagnosticPanel — STEP 7: Developer-only diagnostics
 * 
 * Shows raw commitment fields, canonical derived fields, per-view outputs,
 * cache version, and last mutation source. Highlights mismatches automatically.
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, RefreshCw, Bug } from 'lucide-react';
import { readCanonicalQty, assertSupplyInvariants } from '@/components/supply/canonicalSupplyMath';
import { getSupplyStateVersion } from '@/components/supply/useSupplyStateVersion';

export default function SupplyDiagnosticPanel() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('supplyConsistencyTest', { sample_size: 30 });
      setResults(res.data);
    } catch (e) {
      setResults({ error: e.message });
    }
    setLoading(false);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-20 right-4 z-50 bg-gray-800 border border-gray-600 rounded-full p-2 hover:bg-gray-700 transition-colors"
        title="Supply Diagnostics"
      >
        <Bug className="w-4 h-4 text-gray-400" />
      </button>
    );
  }

  const version = getSupplyStateVersion();
  const lastSource = typeof window !== 'undefined' ? sessionStorage.getItem('supplyStateVersionSource') : null;
  const lastAt = typeof window !== 'undefined' ? sessionStorage.getItem('supplyStateVersionAt') : null;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-96 max-h-[70vh] overflow-auto bg-gray-900 border border-gray-600 rounded-lg shadow-xl">
      <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Supply Diagnostics</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={runDiagnostics} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Cache Version */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="p-2">
            <CardTitle className="text-xs text-gray-400">Cache State</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Version:</span>
              <Badge variant="outline" className="text-xs">{version}</Badge>
            </div>
            {lastSource && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Last bump:</span>
                <span className="text-gray-300">{lastSource}</span>
              </div>
            )}
            {lastAt && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">At:</span>
                <span className="text-gray-300">{new Date(lastAt).toLocaleTimeString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Results */}
        {results && !results.error && (
          <>
            <Card className={`border ${results.status === 'PASS' ? 'border-emerald-700 bg-emerald-900/20' : 'border-red-700 bg-red-900/20'}`}>
              <CardContent className="p-2 flex items-center gap-2">
                {results.status === 'PASS' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-sm font-medium ${results.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {results.status} — {results.commitments_tested} tested
                </span>
              </CardContent>
            </Card>

            {results.cross_model_violations?.length > 0 && (
              <Card className="bg-gray-800 border-red-700">
                <CardHeader className="p-2">
                  <CardTitle className="text-xs text-red-400">Cross-Model Violations ({results.cross_model_violations.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 space-y-1 max-h-40 overflow-auto">
                  {results.cross_model_violations.map((v, i) => (
                    <div key={i} className="text-xs text-gray-300 bg-gray-900 p-1 rounded">
                      <span className="text-red-400">{v.field}</span>: truth={v.ground_truth}, {v.source}={v.ops_value ?? v.gq_value ?? v.inventory_value}
                      <br /><span className="text-gray-500">{v.commitment_id || v.part_id}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {results.derived_state_violations?.length > 0 && (
              <Card className="bg-gray-800 border-amber-700">
                <CardHeader className="p-2">
                  <CardTitle className="text-xs text-amber-400">Derived State Violations ({results.derived_state_violations.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 space-y-1 max-h-40 overflow-auto">
                  {results.derived_state_violations.map((v, i) => (
                    <div key={i} className="text-xs text-gray-300 bg-gray-900 p-1 rounded">
                      <span className="text-amber-400">{v.field}</span>: {v.message}
                      <br /><span className="text-gray-500">{v.commitment_id}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {results?.error && (
          <Card className="bg-gray-800 border-red-700">
            <CardContent className="p-2 text-xs text-red-400">{results.error}</CardContent>
          </Card>
        )}

        {!results && (
          <div className="text-center py-4">
            <Button size="sm" onClick={runDiagnostics} disabled={loading}>
              {loading ? 'Running...' : 'Run Consistency Test'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}