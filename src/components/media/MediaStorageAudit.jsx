import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Search, Loader2, Image, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * MediaStorageAudit — Scans image URLs across entities to find:
 * 1. Image URLs used in entities but missing from MediaAsset records
 * 2. MediaAsset records with dead/broken URLs
 * 3. Summary statistics
 */
export default function MediaStorageAudit({ open, onClose, allAssets, onRefresh }) {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [creating, setCreating] = useState(false);

  const runAudit = async () => {
    setScanning(true);
    setResults(null);

    const imageUrls = new Set();
    const assetUrls = new Set(allAssets.map(a => a.public_url || a.file_url).filter(Boolean));

    // Scan entities that store image URLs
    const scanEntities = [
      { name: 'Project', fields: ['images', 'featured_image_url'] },
      { name: 'Part', fields: ['photos', 'featured_photo'] },
      { name: 'JournalEntry', fields: ['photos'] },
      { name: 'Comment', fields: ['images'] },
      { name: 'TaskComment', fields: ['photos'] },
    ];

    const orphanedInEntities = []; // URLs in entities but not in MediaAsset
    const entityScanResults = {};

    for (const { name, fields } of scanEntities) {
      try {
        const records = await base44.entities[name].list('-created_date', 200);
        let urlCount = 0;

        records.forEach(record => {
          fields.forEach(field => {
            const value = record[field];
            if (!value) return;

            const urls = Array.isArray(value) ? value : [value];
            urls.forEach(url => {
              if (typeof url === 'string' && url.startsWith('http')) {
                imageUrls.add(url);
                urlCount++;
                if (!assetUrls.has(url)) {
                  orphanedInEntities.push({
                    url,
                    entity: name,
                    entityId: record.id,
                    field,
                  });
                }
              }
            });
          });
        });

        entityScanResults[name] = { records: records.length, urlsFound: urlCount };
      } catch (e) {
        entityScanResults[name] = { records: 0, urlsFound: 0, error: e.message };
      }
    }

    // Check for broken MediaAsset URLs (probe with HEAD-like fetch)
    const brokenAssets = [];
    const sampleSize = Math.min(allAssets.length, 50);
    const sample = allAssets.slice(0, sampleSize);
    
    for (const asset of sample) {
      const url = asset.public_url || asset.file_url;
      if (!url) {
        brokenAssets.push({ asset, reason: 'No URL' });
        continue;
      }
      try {
        const img = new window.Image();
        const loaded = await new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url + '?t=' + Date.now();
          setTimeout(() => resolve(null), 5000);
        });
        if (loaded === false) {
          brokenAssets.push({ asset, reason: 'Image failed to load' });
        }
      } catch {
        brokenAssets.push({ asset, reason: 'Check failed' });
      }
    }

    setResults({
      totalAssets: allAssets.length,
      totalEntityUrls: imageUrls.size,
      orphanedInEntities,
      brokenAssets,
      entityScanResults,
      sampleSize,
    });
    setScanning(false);
  };

  const handleCreateMissing = async () => {
    if (!results?.orphanedInEntities?.length) return;
    setCreating(true);

    // Deduplicate by URL
    const uniqueUrls = [...new Map(results.orphanedInEntities.map(o => [o.url, o])).values()];
    let created = 0;

    for (const item of uniqueUrls) {
      try {
        const fileName = item.url.split('/').pop()?.split('?')[0] || 'unknown';
        const pathMatch = item.url.match(/images\/public\/(.+)/);
        const relativePath = pathMatch ? pathMatch[1] : fileName;
        const folderParts = relativePath.split('/');
        const folderPath = folderParts.length > 1 ? folderParts.slice(0, -1).join('/') : '';

        await base44.entities.MediaAsset.create({
          file_name: fileName,
          full_relative_path: relativePath,
          folder_path: folderPath,
          public_url: item.url,
          file_url: item.url,
          type: 'image',
          status: 'active',
          archived: false,
          version: 1,
          source_context: item.entity?.toLowerCase() || 'other',
          notes: `Auto-created from ${item.entity}.${item.field}`,
        });
        created++;
      } catch (e) {
        console.warn('Failed to create MediaAsset for:', item.url, e);
      }
    }

    toast.success(`Created ${created} MediaAsset records from entity scan`);
    setCreating(false);
    onRefresh();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            Storage Audit
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!results && !scanning && (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400 mb-4">
                Scan entities to find image URLs not tracked by MediaAsset records,
                and detect broken/missing files.
              </p>
              <Button onClick={runAudit} className="bg-green-600 hover:bg-green-700 gap-2">
                <Search className="w-4 h-4" /> Run Audit
              </Button>
            </div>
          )}

          {scanning && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-3 text-purple-400 animate-spin" />
              <p className="text-gray-400">Scanning entities and validating URLs...</p>
            </div>
          )}

          {results && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="MediaAsset Records" value={results.totalAssets} color="purple" />
                <StatCard label="Entity URLs Found" value={results.totalEntityUrls} color="blue" />
                <StatCard label="Missing Records" value={results.orphanedInEntities.length} color={results.orphanedInEntities.length > 0 ? 'yellow' : 'green'} />
                <StatCard label="Broken URLs" value={results.brokenAssets.length} color={results.brokenAssets.length > 0 ? 'red' : 'green'} />
              </div>

              {/* Entity scan results */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-3">
                <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Entity Scan</h4>
                <div className="space-y-1">
                  {Object.entries(results.entityScanResults).map(([name, data]) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{name}</span>
                      <span className="text-gray-500">
                        {data.records} records, {data.urlsFound} URLs
                        {data.error && <span className="text-red-400 ml-2">Error</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Missing records */}
              {results.orphanedInEntities.length > 0 && (
                <div className="bg-yellow-900/20 rounded-lg border border-yellow-700/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs text-yellow-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      URLs Missing MediaAsset Records ({results.orphanedInEntities.length})
                    </h4>
                    <Button
                      onClick={handleCreateMissing}
                      disabled={creating}
                      size="sm"
                      className="bg-yellow-600 hover:bg-yellow-700 gap-1.5 text-xs"
                    >
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Create Missing Records
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {results.orphanedInEntities.slice(0, 20).map((item, idx) => (
                      <div key={idx} className="text-xs text-gray-400 flex items-center gap-2">
                        <Badge className="bg-gray-700 text-gray-300 text-[9px]">{item.entity}</Badge>
                        <span className="truncate font-mono">{item.url.split('/').pop()?.split('?')[0]}</span>
                      </div>
                    ))}
                    {results.orphanedInEntities.length > 20 && (
                      <p className="text-xs text-gray-500">...and {results.orphanedInEntities.length - 20} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Broken URLs */}
              {results.brokenAssets.length > 0 && (
                <div className="bg-red-900/20 rounded-lg border border-red-700/50 p-3">
                  <h4 className="text-xs text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Broken / Inaccessible URLs ({results.brokenAssets.length})
                  </h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {results.brokenAssets.map((item, idx) => (
                      <div key={idx} className="text-xs text-gray-400">
                        <span className="text-red-300">{item.asset.file_name}</span>
                        <span className="text-gray-600 ml-2">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.orphanedInEntities.length === 0 && results.brokenAssets.length === 0 && (
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-center">
                  <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="text-green-300 text-sm">All clean — no issues found</p>
                </div>
              )}

              {/* Limitations notice */}
              <div className="bg-gray-800/30 rounded-lg border border-gray-700 p-3 text-xs text-gray-500">
                <p className="font-medium text-gray-400 mb-1">Storage Limitations</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Base44 UploadFile generates a new URL per upload — in-place URL-preserving replacement is <strong className="text-yellow-400">not possible</strong></li>
                  <li>"Replace" updates the MediaAsset record's URL pointer but any hardcoded URL references elsewhere will become stale</li>
                  <li>URL validated against image load, not HTTP HEAD (CORS restrictions)</li>
                  <li>Audit scans first 200 records per entity (API limit)</li>
                  <li>Broken URL check samples first 50 MediaAssets</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {results && (
            <Button onClick={runAudit} variant="outline" className="border-gray-600 gap-2" disabled={scanning}>
              <Search className="w-4 h-4" /> Re-scan
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="border-gray-600">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    purple: 'bg-purple-900/30 border-purple-700/50 text-purple-300',
    blue: 'bg-blue-900/30 border-blue-700/50 text-blue-300',
    green: 'bg-green-900/30 border-green-700/50 text-green-300',
    yellow: 'bg-yellow-900/30 border-yellow-700/50 text-yellow-300',
    red: 'bg-red-900/30 border-red-700/50 text-red-300',
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );
}