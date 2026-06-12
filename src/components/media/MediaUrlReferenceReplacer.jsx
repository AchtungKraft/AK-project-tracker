import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ArrowRight, AlertTriangle, CheckCircle2, Replace } from "lucide-react";
import { toast } from "sonner";

const SCAN_ENTITIES = [
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

export default function MediaUrlReferenceReplacer({ open, onClose, oldUrl: initialOldUrl, newUrl: initialNewUrl }) {
  const [oldUrl, setOldUrl] = useState(initialOldUrl || '');
  const [newUrl, setNewUrl] = useState(initialNewUrl || '');
  const [scanning, setScanning] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [matches, setMatches] = useState(null);
  const [replaced, setReplaced] = useState(false);

  // Reset when props change
  useEffect(() => {
    if (open) {
      setOldUrl(initialOldUrl || '');
      setNewUrl(initialNewUrl || '');
      setMatches(null);
      setReplaced(false);
    }
  }, [open, initialOldUrl, initialNewUrl]);

  const scanReferences = async () => {
    if (!oldUrl.trim()) return;
    setScanning(true);
    setMatches(null);

    const found = [];
    for (const { name, fields } of SCAN_ENTITIES) {
      try {
        const records = await base44.entities[name].list('-created_date', 200);
        for (const record of records) {
          for (const field of fields) {
            const value = record[field];
            if (!value) continue;
            if (Array.isArray(value)) {
              if (value.some(v => typeof v === 'string' && v === oldUrl.trim())) {
                found.push({ entity: name, id: record.id, field, type: 'array' });
              }
            } else if (typeof value === 'string' && value === oldUrl.trim()) {
              found.push({ entity: name, id: record.id, field, type: 'string' });
            }
          }
        }
      } catch (e) {
        console.warn(`Scan failed for ${name}:`, e);
      }
    }

    setMatches(found);
    setScanning(false);
  };

  const executeReplace = async () => {
    if (!matches || matches.length === 0 || !newUrl.trim()) return;
    setReplacing(true);

    let successCount = 0;
    for (const match of matches) {
      try {
        const records = await base44.entities[match.entity].filter({ id: match.id });
        const record = records[0];
        if (!record) continue;

        const currentValue = record[match.field];
        let updatedValue;

        if (match.type === 'array' && Array.isArray(currentValue)) {
          updatedValue = currentValue.map(v => v === oldUrl.trim() ? newUrl.trim() : v);
        } else if (match.type === 'string' && typeof currentValue === 'string') {
          updatedValue = currentValue === oldUrl.trim() ? newUrl.trim() : currentValue;
        } else {
          continue;
        }

        await base44.entities[match.entity].update(match.id, { [match.field]: updatedValue });
        successCount++;
      } catch (e) {
        console.warn(`Replace failed for ${match.entity} ${match.id}:`, e);
      }
    }

    toast.success(`Replaced URL in ${successCount} of ${matches.length} record(s)`);
    setReplaced(true);
    setReplacing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Replace className="w-5 h-5 text-orange-400" />
            Replace URL in App References
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2.5 text-xs text-yellow-300/90">
            <strong>⚠ Controlled operation:</strong> This scans supported entity fields for exact URL matches
            and replaces the old URL with a new one. Preview changes before confirming.
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">Old URL (to find)</label>
            <Input
              value={oldUrl}
              onChange={(e) => setOldUrl(e.target.value)}
              placeholder="https://media.base44.com/images/public/..."
              className="bg-gray-800 border-gray-700 text-white mt-1 text-xs font-mono"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">New URL (replacement)</label>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://media.base44.com/images/public/..."
              className="bg-gray-800 border-gray-700 text-white mt-1 text-xs font-mono"
            />
          </div>

          {!matches && !scanning && (
            <Button
              onClick={scanReferences}
              disabled={!oldUrl.trim()}
              className="bg-orange-600 hover:bg-orange-700 gap-2 w-full"
            >
              <Search className="w-4 h-4" /> Scan for References
            </Button>
          )}

          {scanning && (
            <div className="text-center py-4">
              <Loader2 className="w-6 h-6 mx-auto mb-2 text-orange-400 animate-spin" />
              <p className="text-sm text-gray-400">Scanning entities...</p>
            </div>
          )}

          {matches !== null && (
            <div className="space-y-3">
              {matches.length === 0 ? (
                <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4 text-center">
                  <p className="text-sm text-gray-400">No references found for this URL.</p>
                </div>
              ) : (
                <>
                  <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-3">
                    <h4 className="text-xs text-gray-500 uppercase mb-2">
                      Found {matches.length} reference(s) — preview:
                    </h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {matches.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs py-1">
                          <Badge className="bg-gray-700 text-gray-300 text-[9px]">{m.entity}</Badge>
                          <span className="text-gray-400 font-mono">.{m.field}</span>
                          <span className="text-gray-600">({m.type})</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!replaced ? (
                    <div className="space-y-2">
                      <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2.5 text-xs text-red-300/90">
                        <strong>This will modify {matches.length} record(s).</strong> This action cannot be automatically undone.
                      </div>
                      <Button
                        onClick={executeReplace}
                        disabled={!newUrl.trim() || replacing}
                        className="bg-red-600 hover:bg-red-700 gap-2 w-full"
                      >
                        {replacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        Replace in {matches.length} Record(s)
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-center">
                      <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-400" />
                      <p className="text-green-300 text-sm">Replacement complete</p>
                    </div>
                  )}
                </>
              )}

              <Button onClick={scanReferences} variant="outline" size="sm" className="border-gray-600 gap-2" disabled={scanning}>
                <Search className="w-4 h-4" /> Re-scan
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}