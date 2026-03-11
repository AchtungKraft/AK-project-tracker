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
import { Package, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible completed/cancelled lines section.
 * Memoized — only re-renders when lines array or toggle state changes.
 */
const POReceivingCompletedLines = React.memo(function POReceivingCompletedLines({ 
  lines, 
  showCompleted, 
  onToggle 
}) {
  return (
    <div>
      <button 
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-2"
      >
        {showCompleted ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Fully Received ({lines.length} items)
      </button>
      
      {showCompleted && (
        <Card className="bg-gray-900/30 border-gray-800">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="w-10" />
                <TableHead>Part</TableHead>
                <TableHead className="text-right w-20">Ordered</TableHead>
                <TableHead className="text-right w-20">Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(line => (
                <TableRow 
                  key={line.line_item_id} 
                  className="border-gray-800 opacity-50"
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
                        <div className="font-medium text-gray-400 text-sm">{line.part_name}</div>
                        {line.vendor_part_number && (
                          <div className="text-xs text-gray-600 font-mono">{line.vendor_part_number}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-gray-500">{line.qty_ordered}</TableCell>
                  <TableCell className="text-right font-mono text-green-600">{line.qty_received}</TableCell>
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
      )}
    </div>
  );
});

export default POReceivingCompletedLines;