import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Trash2, Search, Shield, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function TestDataCleanup() {
  const [verifyResult, setVerifyResult] = useState(null);
  const [purgeResult, setPurgeResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  
  // Options
  const [matchMode, setMatchMode] = useState('strict');
  const [limit, setLimit] = useState(200);
  const [hardDelete, setHardDelete] = useState(false);
  const [includeQuarantined, setIncludeQuarantined] = useState(false);

  const runVerify = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('verifyTestLifecycleResidue', {
        include_quarantined: includeQuarantined
      });
      setVerifyResult(res.data);
      toast.success('Verification complete');
    } catch (error) {
      toast.error('Verification failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const runDryRun = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('purgeTestPartLifecycleData', {
        dry_run: true,
        match_mode: matchMode,
        limit: limit,
        hard_delete: hardDelete
      });
      setPurgeResult(res.data);
      toast.success('Dry run complete');
    } catch (error) {
      toast.error('Dry run failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const runPurge = async () => {
    if (confirmText !== 'PURGE_TEST_DATA') {
      toast.error('Please type PURGE_TEST_DATA to confirm');
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('purgeTestPartLifecycleData', {
        dry_run: false,
        match_mode: matchMode,
        limit: limit,
        hard_delete: hardDelete
      });
      setPurgeResult(res.data);
      toast.success('Purge complete!');
      setConfirmText('');
    } catch (error) {
      toast.error('Purge failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold text-white">Test Data Cleanup</h1>
          <p className="text-gray-400 text-sm">Remove TEST_PART_LIFECYCLE records safely</p>
        </div>
      </div>

      {/* Options Card */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400">Match Mode</Label>
              <Select value={matchMode} onValueChange={setMatchMode}>
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">Strict (starts with)</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Limit</Label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 200)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="hardDelete"
                checked={hardDelete}
                onCheckedChange={setHardDelete}
              />
              <Label htmlFor="hardDelete" className="text-gray-300 cursor-pointer">
                Hard Delete (permanent)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="includeQuarantined"
                checked={includeQuarantined}
                onCheckedChange={setIncludeQuarantined}
              />
              <Label htmlFor="includeQuarantined" className="text-gray-300 cursor-pointer">
                Include Quarantined
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={runVerify}
          disabled={loading}
          variant="outline"
          className="border-blue-700 text-blue-400"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          Verify Residue
        </Button>
        <Button
          onClick={runDryRun}
          disabled={loading}
          variant="outline"
          className="border-amber-700 text-amber-400"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
          Dry Run
        </Button>
      </div>

      {/* Verify Results */}
      {verifyResult && (
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              {verifyResult.residue_found ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              Verification Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Parts (strict)</p>
                <p className="text-xl font-bold text-white">{verifyResult.counts.parts_strict}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-xl font-bold text-white">{verifyResult.counts.commitments}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Line Items</p>
                <p className="text-xl font-bold text-white">{verifyResult.counts.line_items}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Requirements</p>
                <p className="text-xl font-bold text-white">{verifyResult.counts.requirements}</p>
              </div>
            </div>
            {verifyResult.samples.parts.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Sample Parts:</p>
                <div className="space-y-1">
                  {verifyResult.samples.parts.map(p => (
                    <div key={p.id} className="text-xs text-gray-400 font-mono">
                      {p.part_name} {p.is_quarantined && <Badge className="bg-amber-600 ml-2">Quarantined</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Purge Results */}
      {purgeResult && (
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Badge className={purgeResult.status === 'DRY_RUN' ? 'bg-amber-600' : 'bg-green-600'}>
                {purgeResult.status}
              </Badge>
              Purge Result
            </CardTitle>
            <CardDescription className="text-gray-400">
              Batch ID: {purgeResult.batch_id}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Parts Matched</p>
                <p className="text-xl font-bold text-white">{purgeResult.parts_matched}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Parts Processed</p>
                <p className="text-xl font-bold text-green-400">{purgeResult.parts_quarantined_or_deleted}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Commitments</p>
                <p className="text-xl font-bold text-white">{purgeResult.commitments_quarantined_or_deleted}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Line Items</p>
                <p className="text-xl font-bold text-white">{purgeResult.line_items_quarantined_or_deleted}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Installed Parts</p>
                <p className="text-xl font-bold text-white">{purgeResult.installed_parts_quarantined_or_deleted}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-500">Requirements</p>
                <p className="text-xl font-bold text-white">{purgeResult.requirements_quarantined_or_deleted}</p>
              </div>
            </div>

            {purgeResult.warnings?.length > 0 && (
              <div className="p-3 bg-red-900/20 border border-red-700/50 rounded mb-4">
                <p className="text-xs text-red-400 font-semibold mb-1">Warnings:</p>
                {purgeResult.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-red-300">{w}</p>
                ))}
              </div>
            )}

            {purgeResult.samples?.parts?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Sample Parts:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {purgeResult.samples.parts.map(p => (
                    <div key={p.id} className="text-xs text-gray-400 font-mono truncate">
                      {p.part_name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Apply Purge */}
      {purgeResult && purgeResult.status === 'DRY_RUN' && purgeResult.parts_matched > 0 && (
        <Card className="bg-red-950/30 border-red-700/50">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Apply Purge
            </CardTitle>
            <CardDescription className="text-red-300/70">
              This will {hardDelete ? 'permanently delete' : 'quarantine'} {purgeResult.parts_matched} parts and all related records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-400">Type PURGE_TEST_DATA to confirm</Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="PURGE_TEST_DATA"
                className="bg-gray-800 border-gray-700 font-mono"
              />
            </div>
            <Button
              onClick={runPurge}
              disabled={loading || confirmText !== 'PURGE_TEST_DATA'}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Apply Purge
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}