import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible completed/cancelled lines section.
 * Memoized — only re-renders when lines array or toggle state changes.
 */
const POReceivingCompletedLines = React.memo(function POReceivingCompletedLines({ 
  lines,
  onOpenPart, 
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-green-400">
          Completed / Received Items
        </h3>
        <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-600">
          {lines.length}
        </Badge>
      </div>
      
        <Card className="bg-gray-900/30 border-gray-800">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="w-10" />
                <TableHead>Part</TableHead>
                <TableHead className="text-right w-20">Ordered</TableHead>
                <TableHead className="text-right w-20">Received</TableHead>
                <TableHead className="text-right w-24">Unit Cost</TableHead>
                <TableHead className="text-right w-24">Ext. Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(line => (
                <TableRow 
                  key={line.line_item_id} 
                  className="border-gray-800 bg-green-950/10"
                >
                  <TableCell>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {line.featured_photo ? (
                        <img src={line.featured_photo} alt="" className="w-8 h-8 rounded object-contain bg-gray-800" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center">
                          <Package className="w-4 h-4 text-gray-600" />
                        </div>
                      )}
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenPart?.(line.part_id)}
                          className="font-medium text-blue-400 hover:text-blue-300 hover:underline text-sm text-left"
                        >
                          {line.part_name}
                        </button>
                        {line.vendor_part_number && (
                          <div className="text-xs text-gray-600 font-mono">{line.vendor_part_number}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-300">{line.qty_ordered}</TableCell>
                  <TableCell className="text-right font-mono text-green-400">{line.qty_received}</TableCell>
                  <TableCell className="text-right font-mono text-gray-300 text-sm">
                    {(line.unit_cost ?? 0) > 0 ? `$${(line.unit_cost).toFixed(2)}` : '$0'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-300 text-sm">
                    ${((line.unit_cost || 0) * (line.qty_ordered || 0)).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(
                      "text-xs",
                      line.is_line_cancelled 
                        ? "bg-red-500/20 text-red-400 border-red-500/30" 
                        : "bg-green-500/20 text-green-400 border-green-500/30"
                    )}>
                      {line.is_line_cancelled ? 'Cancelled' : 'Received'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500">{line.project_name}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
    </div>
  );
});

export default POReceivingCompletedLines;