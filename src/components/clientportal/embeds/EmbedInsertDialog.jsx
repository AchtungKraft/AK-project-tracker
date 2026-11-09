import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { parseEmbedInput } from "@/lib/excelEmbeds";

// Paste an Excel embed URL or iframe code; only approved Microsoft endpoints are accepted.
export default function EmbedInsertDialog({ open, onClose, onInsert }) {
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const close = () => { setRaw(""); setTitle(""); setError(""); onClose(); };
  const insert = () => {
    const r = parseEmbedInput(raw);
    if (r.error) { setError(r.error); return; }
    onInsert({ url: r.url, title: (title.trim() || r.title || "Excel workbook").slice(0, 120) });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Embed Excel workbook</DialogTitle>
          <DialogDescription className="text-gray-400">
            In Excel (OneDrive or SharePoint) use File → Share → Embed, then paste the embed code or link. The client sees live data, and Microsoft's sharing settings still apply.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-gray-300">Embed code or URL</Label>
            <Textarea value={raw} onChange={(e) => { setRaw(e.target.value); setError(""); }} placeholder='<iframe src="https://onedrive.live.com/embed?..."></iframe>' className="bg-gray-800 border-gray-700 text-white min-h-[100px] font-mono text-xs" />
          </div>
          <div>
            <Label className="text-gray-300">Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Excel workbook" className="bg-gray-800 border-gray-700 text-white" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} className="border-gray-700">Cancel</Button>
          <Button type="button" onClick={insert} disabled={!raw.trim()} className="bg-red-600 hover:bg-red-700">Insert embed</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}