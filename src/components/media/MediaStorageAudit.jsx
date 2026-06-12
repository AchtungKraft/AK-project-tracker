import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, AlertTriangle, Search, Loader2, Plus, Info,
  CheckCircle2, XCircle, Globe, Database, HardDrive, Link2
} from "lucide-react";
import { toast } from "sonner";

/**
 * MediaStorageAudit — Two-tier audit:
 * 1. Entity Reference Scan — finds image URLs used in entities without MediaAsset records
 * 2. URL Probe & Register — paste any URL to verify it loads and create a MediaAsset record
 * Also shows a Platform Capabilities Report.
 */
export default function MediaStorageAudit({ open, onClose, allAssets, onRefresh }) {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('scan'); // scan | probe | capabilities
  const [probeUrls, setProbeUrls] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState(null);

  const assetUrlSet = new Set(allAssets.map(a => a.public_url || a.file_url).filter(Boolean));

  // ── ENTITY REFERENCE SCAN ──
  const runEntityScan = async () => {
    setScanning(true);
    setResults(null);

    const imageUrls = new Set();
    const scanEntities = [
      { name: 'Project', fields: ['images', 'featured_image_url'] },
      { name: 'Part', fields: ['photos', 'featured_photo'] },
      { name: 'JournalEntry', fields: ['photos'] },
      { name: 'Comment', fields: ['images'] },
      { name: 'TaskComment', fields: ['photos'] },
      { name: 'ClientFeedbackAttachment', fields: ['file_url'] },
      { name: 'ClientFeedbackComment', fields: ['photos'] },
      { name: 'BuildKnowledgeItem', fields: ['image_urls', 'cover_image_url', 'media_urls'] },
      { name: 'BuildKnowledgeProjectNote', fields: ['photos'] },
    ];

    const orphanedInEntities = [];
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
                if (!assetUrlSet.has(url)) {
                  orphanedInEntities.push({ url, entity: name, entityId: record.id, field });
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

    // Broken URL sample check
    const brokenAssets = [];
    const sampleSize = Math.min(allAssets.length, 50);
    for (const asset of allAssets.slice(0, sampleSize)) {
      const url = asset.public_url || asset.file_url;
      if (!url) { brokenAssets.push({ asset, reason: 'No URL' }); continue; }
      try {
        const loaded = await probeImageUrl(url);
        if (!loaded) brokenAssets.push({ asset, reason: 'Image failed to load' });
      } catch { brokenAssets.push({ asset, reason: 'Check failed' }); }
    }

    setResults({ totalAssets: allAssets.length, totalEntityUrls: imageUrls.size, orphanedInEntities, brokenAssets, entityScanResults, sampleSize });
    setScanning(false);
  };

  const handleCreateMissing = async () => {
    if (!results?.orphanedInEntities?.length) return;
    setCreating(true);
    const uniqueUrls = [...new Map(results.orphanedInEntities.map(o => [o.url, o])).values()];
    let created = 0;

    for (const item of uniqueUrls) {
      try {
        const fileName = item.url.split('/').pop()?.split('?')[0] || 'unknown';
        const pathMatch = item.url.match(/images\/public\/(.+?)(\?|$)/);
        const relativePath = pathMatch ? pathMatch[1] : fileName;
        const folderParts = relativePath.split('/');
        const folderPath = folderParts.length > 1 ? folderParts.slice(0, -1).join('/') : '';

        await base44.entities.MediaAsset.create({
          file_name: fileName, full_relative_path: relativePath, folder_path: folderPath,
          public_url: item.url, file_url: item.url, type: 'image', status: 'active',
          archived: false, version: 1,
          source_context: item.entity?.toLowerCase() || 'other',
          notes: `Auto-created from ${item.entity}.${item.field}`,
        });
        created++;
      } catch (e) { console.warn('Failed:', item.url, e); }
    }

    toast.success(`Created ${created} MediaAsset records`);
    setCreating(false);
    onRefresh();
  };

  // ── URL PROBE & REGISTER ──
  const runProbe = async () => {
    const urls = probeUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setProbing(true);
    setProbeResults(null);

    const probed = [];
    for (const url of urls) {
      const alreadyTracked = assetUrlSet.has(url);
      const existingAsset = alreadyTracked ? allAssets.find(a => (a.public_url || a.file_url) === url) : null;
      const loaded = await probeImageUrl(url);
      probed.push({ url, loaded, alreadyTracked, existingAsset });
    }
    setProbeResults(probed);
    setProbing(false);
  };

  const registerProbed = async () => {
    if (!probeResults) return;
    const toRegister = probeResults.filter(p => p.loaded && !p.alreadyTracked);
    if (toRegister.length === 0) { toast.info('Nothing new to register'); return; }

    setProbing(true);
    let created = 0;
    for (const item of toRegister) {
      try {
        const fileName = item.url.split('/').pop()?.split('?')[0] || 'unknown';
        const pathMatch = item.url.match(/images\/public\/(.+?)(\?|$)/);
        const relativePath = pathMatch ? pathMatch[1] : fileName;
        const folderParts = relativePath.split('/');
        const folderPath = folderParts.length > 1 ? folderParts.slice(0, -1).join('/') : '';

        await base44.entities.MediaAsset.create({
          file_name: fileName, full_relative_path: relativePath, folder_path: folderPath,
          public_url: item.url, file_url: item.url, type: 'image', status: 'active',
          archived: false, version: 1, source_context: 'upload',
          notes: 'Registered via URL Probe',
        });
        created++;
      } catch (e) { console.warn('Failed:', item.url, e); }
    }
    toast.success(`Registered ${created} new MediaAsset records`);
    setProbing(false);
    onRefresh();
  };

  const tabs = [
    { key: 'scan', label: 'Entity Scan', icon: Database },
    { key: 'probe', label: 'URL Probe & Register', icon: Link2 },
    { key: 'capabilities', label: 'Platform Report', icon: HardDrive },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            Storage Audit & Discovery
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-4">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === key ? 'border-purple-500 text-purple-300' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* ── ENTITY SCAN TAB ── */}
        {activeTab === 'scan' && (
          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-xs text-blue-300/90">
              <strong>What this does:</strong> Scans app entities (Project, Part, JournalEntry, etc.) for image URLs
              and checks which ones are missing MediaAsset records. This is a <em>usage-discovery</em> layer —
              it finds images referenced in your data.
            </div>

            {!results && !scanning && (
              <div className="text-center py-6">
                <Button onClick={runEntityScan} className="bg-green-600 hover:bg-green-700 gap-2">
                  <Search className="w-4 h-4" /> Run Entity Scan
                </Button>
              </div>
            )}

            {scanning && (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 mx-auto mb-3 text-purple-400 animate-spin" />
                <p className="text-gray-400 text-sm">Scanning entities...</p>
              </div>
            )}

            {results && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="MediaAsset Records" value={results.totalAssets} color="purple" />
                  <StatCard label="Entity URLs" value={results.totalEntityUrls} color="blue" />
                  <StatCard label="Missing Records" value={results.orphanedInEntities.length} color={results.orphanedInEntities.length > 0 ? 'yellow' : 'green'} />
                  <StatCard label="Broken URLs" value={results.brokenAssets.length} color={results.brokenAssets.length > 0 ? 'red' : 'green'} />
                </div>

                <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-3">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Entity Scan</h4>
                  {Object.entries(results.entityScanResults).map(([name, data]) => (
                    <div key={name} className="flex items-center justify-between text-sm py-0.5">
                      <span className="text-gray-300">{name}</span>
                      <span className="text-gray-500">{data.records} records, {data.urlsFound} URLs{data.error && <span className="text-red-400 ml-2">Error</span>}</span>
                    </div>
                  ))}
                </div>

                {results.orphanedInEntities.length > 0 && (
                  <div className="bg-yellow-900/20 rounded-lg border border-yellow-700/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs text-yellow-400 uppercase flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" />Missing Records ({results.orphanedInEntities.length})
                      </h4>
                      <Button onClick={handleCreateMissing} disabled={creating} size="sm" className="bg-yellow-600 hover:bg-yellow-700 gap-1.5 text-xs">
                        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Create Missing
                      </Button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {results.orphanedInEntities.slice(0, 20).map((item, idx) => (
                        <div key={idx} className="text-xs text-gray-400 flex items-center gap-2">
                          <Badge className="bg-gray-700 text-gray-300 text-[9px]">{item.entity}</Badge>
                          <span className="truncate font-mono">{item.url.split('/').pop()?.split('?')[0]}</span>
                        </div>
                      ))}
                      {results.orphanedInEntities.length > 20 && <p className="text-xs text-gray-500">...and {results.orphanedInEntities.length - 20} more</p>}
                    </div>
                  </div>
                )}

                {results.brokenAssets.length > 0 && (
                  <div className="bg-red-900/20 rounded-lg border border-red-700/50 p-3">
                    <h4 className="text-xs text-red-400 uppercase mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" />Broken URLs ({results.brokenAssets.length})
                    </h4>
                    <div className="max-h-24 overflow-y-auto space-y-1">
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
                  <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-center">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-400" />
                    <p className="text-green-300 text-sm">All clean</p>
                  </div>
                )}

                <Button onClick={runEntityScan} variant="outline" size="sm" className="border-gray-600 gap-2" disabled={scanning}>
                  <Search className="w-4 h-4" /> Re-scan
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── URL PROBE TAB ── */}
        {activeTab === 'probe' && (
          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-xs text-blue-300/90">
              <strong>What this does:</strong> Paste one or more image URLs (one per line).
              The system will check if each URL loads, whether it already has a MediaAsset record,
              and let you register any untracked images. Use this to manually add images that exist
              in storage but aren't tracked.
            </div>

            <Textarea
              placeholder={"Paste image URLs — one per line\nhttps://media.base44.com/images/public/abc/image.png\nhttps://media.base44.com/images/public/def/photo.jpg"}
              value={probeUrls}
              onChange={(e) => setProbeUrls(e.target.value)}
              className="bg-gray-800/50 border-gray-700 text-white min-h-[100px] text-xs font-mono"
            />

            <Button onClick={runProbe} disabled={probing || !probeUrls.trim()} className="bg-purple-600 hover:bg-purple-700 gap-2">
              {probing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Probe URLs
            </Button>

            {probeResults && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Probed" value={probeResults.length} color="purple" />
                  <StatCard label="Accessible" value={probeResults.filter(p => p.loaded).length} color="green" />
                  <StatCard label="New (Untracked)" value={probeResults.filter(p => p.loaded && !p.alreadyTracked).length} color="yellow" />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1">
                  {probeResults.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs py-1 border-b border-gray-800">
                      {p.loaded ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      <span className="font-mono text-gray-300 truncate flex-1">{p.url.split('/').pop()?.split('?')[0]}</span>
                      {p.alreadyTracked ? (
                        <Badge className="bg-blue-900/50 text-blue-300 text-[9px]">Tracked</Badge>
                      ) : p.loaded ? (
                        <Badge className="bg-yellow-900/50 text-yellow-300 text-[9px]">New</Badge>
                      ) : (
                        <Badge className="bg-red-900/50 text-red-300 text-[9px]">Failed</Badge>
                      )}
                    </div>
                  ))}
                </div>

                {probeResults.some(p => p.loaded && !p.alreadyTracked) && (
                  <Button onClick={registerProbed} disabled={probing} size="sm" className="bg-yellow-600 hover:bg-yellow-700 gap-1.5 text-xs">
                    {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Register {probeResults.filter(p => p.loaded && !p.alreadyTracked).length} New Asset(s)
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PLATFORM CAPABILITIES TAB ── */}
        {activeTab === 'capabilities' && (
          <div className="space-y-4">
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
              <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-400" />
                Base44 Storage Capabilities Report
              </h4>

              <div className="space-y-2">
                <CapRow supported={false} label="List public media folders" detail="No API exists to enumerate directories under /images/public/" />
                <CapRow supported={false} label="List files in /images/public/" detail="No directory listing endpoint. Files can only be discovered via entity references or known URLs." />
                <CapRow supported={false} label="Read file metadata from storage" detail="No server-side metadata API. Metadata must be stored in MediaAsset entity records." />
                <CapRow supported={true} label="Upload to public storage" detail="UploadFile integration returns a new public URL. Path is auto-generated — cannot specify target path." />
                <CapRow supported={false} label="Overwrite file at same URL" detail="Each UploadFile call generates a unique URL. In-place overwrite is not possible." />
                <CapRow supported={false} label="Move / rename files" detail="No server-side move or rename. Folder structure is metadata-only in MediaAsset records." />
                <CapRow supported={false} label="Delete physical files from storage" detail="No storage deletion API. Files persist at their URLs indefinitely." />
                <CapRow supported={true} label="Probe URL accessibility" detail="Can verify if a URL loads via client-side image probe (not HTTP HEAD due to CORS)." />
                <CapRow supported={true} label="Track files via MediaAsset entity" detail="Full CRUD on MediaAsset records for metadata, folder paths, tags, and status tracking." />
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 text-xs text-yellow-300/90 space-y-2">
              <p className="font-medium">What this means for Media Library:</p>
              <ul className="list-disc list-inside space-y-1 text-yellow-300/70">
                <li><strong>No automatic storage scanning</strong> — the library cannot discover files it doesn't already know about</li>
                <li><strong>Discovery relies on</strong>: entity scanning (finds referenced images), URL probing (manually verify known URLs), and uploads through this UI</li>
                <li><strong>"Replace" changes the URL</strong> — the MediaAsset record is updated but the old URL persists in storage</li>
                <li><strong>"Folders" are metadata-only</strong> — derived from URL path structure, not physical directories</li>
                <li><strong>"Go To URL" auto-registers</strong> — pasting any valid public image URL will verify it loads and create a MediaAsset record</li>
                <li><strong>Files never truly delete</strong> — archiving hides from UI but the physical file and URL remain accessible</li>
              </ul>
            </div>

            <div className="bg-gray-800/30 rounded-lg border border-gray-700 p-3 text-xs text-gray-400">
              <p className="font-medium text-gray-300 mb-1">Recommended Workflow</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Run <strong>Entity Scan</strong> to discover all referenced images and create MediaAsset records</li>
                <li>Use <strong>URL Probe</strong> to register any known images not referenced by entities</li>
                <li>Use <strong>Go To URL</strong> in the main header for quick single-URL access and registration</li>
                <li>Upload new files through the <strong>Upload</strong> button — they auto-register</li>
                <li>Organize with <strong>Bulk Move</strong> to assign folder paths (metadata-only)</li>
              </ol>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──

function probeImageUrl(url) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url + (url.includes('?') ? '&' : '?') + '_probe=' + Date.now();
    setTimeout(() => resolve(false), 8000);
  });
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

function CapRow({ supported, label, detail }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-700/50 last:border-0">
      {supported
        ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
      }
      <div>
        <p className="text-sm text-gray-200">{label}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
    </div>
  );
}