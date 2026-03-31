import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bug, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SupplyMathDebugPanel - DEV ONLY
 * 
 * Displays raw supply math fields for each commitment row.
 * Allows immediate diagnosis of coverage invariant drift.
 * 
 * INVARIANT: required_total = reserved_from_stock + covered_from_po + to_order
 * 
 * This component should ONLY render in development mode.
 */
export default function SupplyMathDebugPanel({ items = [], onRefresh }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Only render in development
  if (!import.meta.env.DEV) {
    return null;
  }

  // Check invariants for all items
  const violations = items.filter(item => {
    const { required_total = 0, reserved_from_stock = 0, covered_from_po = 0, to_order = 0 } = item;
    const sum = reserved_from_stock + covered_from_po + to_order;
    return Math.abs(sum - required_total) > 0.01;
  });

  const hasViolations = violations.length > 0;

  return (
    <Card className={cn(
      "fixed bottom-4 right-4 z-50 w-[600px] shadow-xl border-2",
      hasViolations ? "bg-red-950/95 border-red-600" : "bg-gray-950/95 border-purple-600"
    )}>
      <CardHeader 
        className="p-3 cursor-pointer flex flex-row items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="text-sm flex items-center gap-2">
          <Bug className="w-4 h-4 text-purple-400" />
          <span className="text-purple-400">Supply Math Debug</span>
          {hasViolations ? (
            <Badge className="bg-red-600 text-xs">{violations.length} INVARIANT VIOLATIONS</Badge>
          ) : (
            <Badge className="bg-green-600 text-xs">✓ All Valid</Badge>
          )}
          <span className="text-gray-500 text-xs">({items.length} items)</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onRefresh?.(); }}
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0">
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 text-xs">
                  <TableHead className="text-gray-500 w-8">✓</TableHead>
                  <TableHead className="text-gray-500">Part</TableHead>
                  <TableHead className="text-gray-500 text-right">Req</TableHead>
                  <TableHead className="text-gray-500 text-right">Res</TableHead>
                  <TableHead className="text-gray-500 text-right">Cov</TableHead>
                  <TableHead className="text-gray-500 text-right">ToOrd</TableHead>
                  <TableHead className="text-gray-500 text-right">Sum</TableHead>
                  <TableHead className="text-gray-500 text-right">Rcv</TableHead>
                  <TableHead className="text-gray-500 text-right">Inst</TableHead>
                  <TableHead className="text-gray-500 text-right">Phys</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => {
                  const {
                    commitment_id,
                    part_name,
                    required_total = 0,
                    reserved_from_stock = 0,
                    covered_from_po = 0,
                    to_order = 0,
                    received_qty = 0,
                    qty_installed = 0,
                    inventory_snapshot = {}
                  } = item;
                  
                  const sum = reserved_from_stock + covered_from_po + to_order;
                  const isValid = Math.abs(sum - required_total) <= 0.01;
                  const physical_stock = inventory_snapshot?.physical_stock ?? 0;

                  return (
                    <TableRow 
                      key={commitment_id} 
                      className={cn(
                        "border-gray-800 text-xs",
                        !isValid && "bg-red-900/30"
                      )}
                    >
                      <TableCell>
                        {isValid ? (
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-400" />
                        )}
                      </TableCell>
                      <TableCell className="text-white truncate max-w-[100px]" title={part_name}>
                        {part_name}
                      </TableCell>
                      <TableCell className="text-right text-yellow-400 font-mono">
                        {required_total}
                      </TableCell>
                      <TableCell className="text-right text-blue-400 font-mono">
                        {reserved_from_stock}
                      </TableCell>
                      <TableCell className="text-right text-purple-400 font-mono">
                        {covered_from_po}
                      </TableCell>
                      <TableCell className="text-right text-orange-400 font-mono">
                        {to_order}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-bold",
                        isValid ? "text-green-400" : "text-red-400"
                      )}>
                        {sum}
                      </TableCell>
                      <TableCell className="text-right text-gray-400 font-mono">
                        {received_qty}
                      </TableCell>
                      <TableCell className="text-right text-gray-400 font-mono">
                        {qty_installed}
                      </TableCell>
                      <TableCell className="text-right text-cyan-400 font-mono">
                        {physical_stock}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Legend */}
          <div className="p-2 border-t border-gray-800 text-xs text-gray-500 flex gap-4">
            <span>Req = required_total</span>
            <span className="text-blue-400">Res = reserved</span>
            <span className="text-purple-400">Cov = covered_po</span>
            <span className="text-orange-400">ToOrd = to_order</span>
            <span>INVARIANT: Req = Res + Cov + ToOrd</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}