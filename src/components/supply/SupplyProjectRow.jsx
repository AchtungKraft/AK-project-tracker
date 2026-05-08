import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Package, ChevronRight, CheckCircle2 } from "lucide-react";

export default function SupplyProjectRow({ project, onClick, getCoverageColor, muted }) {
  return (
    <TableRow
      className={`border-gray-800 hover:bg-gray-800/30 cursor-pointer ${muted ? 'opacity-50' : ''}`}
      onClick={() => onClick(project.project_id)}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          {project.featured_image_url && (
            <div className="w-10 h-10 bg-gray-800 rounded overflow-hidden flex-shrink-0">
              <img src={project.featured_image_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div>
            <p className="text-white font-medium">{project.project_name}</p>
            <p className="text-xs text-gray-500">{project.client_name}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-white">{project.total_commitments || 0}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className={getCoverageColor(project.coverage_percent)}>
          {project.coverage_percent || 0}%
        </span>
      </TableCell>
      <TableCell className="text-right">
        <span className={project.needs_order_count > 0 ? 'text-purple-400' : 'text-gray-400'}>
          {project.needs_order_count || 0}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center gap-2 justify-center">
          <Progress value={project.install_percent || 0} className="w-16 h-2" />
          <span className="text-xs text-gray-400">{project.install_percent || 0}%</span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1">
          {project.needs_order_count > 0 && (
            <Badge variant="outline" className="border-purple-600 text-purple-400 text-xs">
              <Package className="w-3 h-3 mr-1" />
              Order
            </Badge>
          )}
          {project.ready_to_install_count > 0 && (
            <Badge variant="outline" className="border-green-600 text-green-400 text-xs">
              Install
            </Badge>
          )}
          {!project.needs_order_count && !project.ready_to_install_count && project.total_commitments > 0 && (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          )}
        </div>
      </TableCell>
      <TableCell>
        <ChevronRight className="w-4 h-4 text-gray-500" />
      </TableCell>
    </TableRow>
  );
}