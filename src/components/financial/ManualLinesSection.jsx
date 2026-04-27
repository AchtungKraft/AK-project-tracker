import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

/**
 * ManualLinesSection — Inline manual/outside cost line editor.
 * Renders only when lines exist. Add button is in parent.
 */
export default function ManualLinesSection({ lines, onUpdate, onRemove }) {
  if (lines.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-400">Manual / Outside Costs</Label>
      {lines.map((line) => (
        <div key={line.id} className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg">
          <Input
            placeholder="Description"
            value={line.description}
            onChange={(e) => onUpdate(line.id, "description", e.target.value)}
            className="flex-1 h-8 text-sm"
          />
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <Input
              type="number"
              placeholder="0.00"
              value={line.amount || ""}
              onChange={(e) => onUpdate(line.id, "amount", e.target.value)}
              className="w-24 h-8 text-sm font-mono"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(line.id)}
            className="h-8 w-8 text-gray-400 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}