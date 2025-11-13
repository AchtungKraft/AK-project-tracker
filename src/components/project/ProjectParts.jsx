import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Package } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ProjectParts({ projectId }) {
  // Note: This would hook to external parts inventory API
  // For now, showing placeholder UI
  const [parts, setParts] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const refreshParts = async () => {
    setLoading(true);
    // TODO: Implement external hook: GET /parts?project_id={projectId}
    // const response = await fetch(`/parts?project_id=${projectId}`);
    // const data = await response.json();
    // setParts(data);
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5" />
            Parts Used
          </CardTitle>
          <Button 
            onClick={refreshParts}
            disabled={loading}
            size="sm"
            variant="outline"
            className="border-gray-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {parts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-500 mb-2">No parts data available</p>
            <p className="text-sm text-gray-600">
              Parts will be synced from the external inventory system
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-red-900/20">
                  <TableHead className="text-gray-400">Part Name</TableHead>
                  <TableHead className="text-gray-400">Part #</TableHead>
                  <TableHead className="text-gray-400">Category</TableHead>
                  <TableHead className="text-gray-400">Qty</TableHead>
                  <TableHead className="text-gray-400">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((part, index) => (
                  <TableRow key={index} className="border-b border-red-900/10">
                    <TableCell className="text-white">{part.name}</TableCell>
                    <TableCell className="text-gray-400">{part.part_number}</TableCell>
                    <TableCell className="text-gray-400">{part.category}</TableCell>
                    <TableCell className="text-gray-400">{part.quantity}</TableCell>
                    <TableCell className="text-gray-400">{part.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 text-sm text-gray-400">
              Total parts: {parts.length}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}