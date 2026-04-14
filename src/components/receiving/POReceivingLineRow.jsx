import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const LOCATION_NONE = "__none__";

/**
 * Memoized table row for a single open PO line.
 * Only re-renders when its own data changes, not when sibling rows change.
 */
const POReceivingLineRow = React.memo(function POReceivingLineRow({
  line,
  input,
  isSelected,
  locations,
  onToggle,
  onUpdateInput,
}) {
  return (
    <TableRow
      className={cn(
        "border-gray-700",
        isSelected && "bg-green-900/10"
      )}
    >
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggle(line.line_item_id)}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          {line.featured_photo ? (
            <img src={line.featured_photo} alt="" className="w-8 h-8 rounded object-contain bg-gray-800" />
          ) : (
            <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center">
              <Package className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <div>
            <div className="font-medium text-white text-sm">{line.part_name}</div>
            {line.vendor_part_number && (
              <div className="text-xs text-gray-500 font-mono">{line.vendor_part_number}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-gray-300">{line.qty_ordered}</TableCell>
      <TableCell className="text-right font-mono text-green-400">{line.qty_received}</TableCell>
      <TableCell className="text-right font-mono font-bold text-blue-400">{line.qty_remaining}</TableCell>
      <TableCell className="text-right font-mono text-gray-300 text-sm">
        {(line.unit_cost ?? 0) > 0 ? `$${(line.unit_cost).toFixed(2)}` : <span className="text-red-400">$0</span>}
      </TableCell>
      <TableCell className="text-right font-mono text-gray-300 text-sm">
        ${((line.unit_cost || 0) * (line.qty_ordered || 0)).toFixed(2)}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={line.qty_remaining}
          value={input.receive_qty}
          onChange={(e) => {
            const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), line.qty_remaining);
            onUpdateInput(line.line_item_id, 'receive_qty', val);
          }}
          className="w-20 h-8 text-center bg-gray-800 border-gray-600"
        />
      </TableCell>
      <TableCell>
        <Select
          value={input.location_id || LOCATION_NONE}
          onValueChange={(v) => onUpdateInput(line.line_item_id, 'location_id', v)}
        >
          <SelectTrigger className="h-8 bg-gray-800 border-gray-600">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LOCATION_NONE}>No location</SelectItem>
            {locations?.map(loc => (
              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-400">{line.project_name}</span>
          {(line.unit_cost ?? 0) <= 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono text-red-400">
              <AlertTriangle className="w-3 h-3" /> NO COST
            </span>
          )}
          {(line.unit_cost ?? 0) > 0 && (
            <span className="text-[9px] font-mono text-emerald-500/70">
              ${(line.unit_cost || 0).toFixed(2)}/ea
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

export default POReceivingLineRow;