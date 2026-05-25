import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckSquare, ClipboardPaste, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import parseChecklistImport from "./parseChecklistImport";

export default function BulkChecklistImportModal({ open, onOpenChange, onImport, isImporting }) {
  const isMobile = useIsMobile();
  const textareaRef = useRef(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (open) {
      setText("");
      setPreview(null);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const parsed = parseChecklistImport(text);

  const handlePreview = () => {
    setPreview(parsed);
  };

  const handleImport = () => {
    const items = preview || parsed;
    if (items.length === 0) return;
    onImport(items);
  };

  const itemsToShow = preview || (parsed.length > 0 ? null : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "bg-gray-900 border-gray-700 text-white",
        isMobile ? "max-w-[95vw] max-h-[90vh]" : "max-w-lg max-h-[80vh]"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ClipboardPaste className="w-5 h-5 text-red-400" />
            Bulk Add Checklist Items
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1">
          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setPreview(null); }}
            placeholder={"Paste one checklist item per line...\n\nSupports:\n• Bullet points\n1. Numbered lists\n[x] Checkbox syntax"}
            className={cn(
              "bg-gray-800/60 border-gray-700 text-white placeholder:text-gray-500 resize-none",
              isMobile ? "min-h-[200px]" : "min-h-[180px]"
            )}
          />

          {/* Live count */}
          {text.trim() && !preview && (
            <p className="text-xs text-gray-400">
              {parsed.length} item{parsed.length !== 1 ? 's' : ''} detected
              {parsed.some(i => i.completed) && (
                <span className="text-green-400 ml-1">
                  ({parsed.filter(i => i.completed).length} pre-checked)
                </span>
              )}
            </p>
          )}

          {/* Preview panel */}
          {preview && (
            <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {preview.length === 0 ? (
                <p className="text-sm text-yellow-400">No valid checklist items detected.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-medium">
                      Will create {preview.length} checklist item{preview.length !== 1 ? 's' : ''}
                    </p>
                    <Badge variant="outline" className="border-gray-600 text-gray-300 text-xs">
                      Preview
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {preview.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckSquare className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          item.completed ? "text-green-400" : "text-gray-500"
                        )} />
                        <span className={cn(
                          item.completed ? "text-green-300" : "text-gray-200"
                        )}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>

          {!preview ? (
            <Button
              onClick={handlePreview}
              disabled={parsed.length === 0}
              className="bg-gray-700 hover:bg-gray-600 text-white"
            >
              Preview ({parsed.length})
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={preview.length === 0 || isImporting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isImporting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Creating...</>
              ) : (
                <>Create {preview.length} Item{preview.length !== 1 ? 's' : ''}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}