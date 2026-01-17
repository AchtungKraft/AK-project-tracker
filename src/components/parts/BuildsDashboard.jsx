import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FolderTree, Search, Package, Plus, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function BuildsDashboard({ onPartClick }) {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date')
  });

  const { data: partAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list()
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list()
  });

  const projectStatuses = statuses.filter((s) => s.scope === 'Project');

  // Get project IDs that have parts assigned
  const projectIdsWithParts = new Set(partAssignments.map(a => a.project_id));

  const filteredProjects = projects.filter((p) => {
    // Only show projects that have parts assigned
    if (!projectIdsWithParts.has(p.id)) return false;
    
    // Apply search filter
    return p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vin?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getProjectAssignedParts = (projectId) => {
    const assignments = partAssignments.filter((a) => a.project_id === projectId);
    return assignments.map((a) => {
      const part = parts.find((p) => p.id === a.part_id);
      return { assignment: a, part };
    }).filter((item) => item.part);
  };

  const getGlobalParts = () => {
    return parts.filter((p) => p.global_all_builds);
  };

  const globalParts = getGlobalParts();

  return (
    <div className="space-y-4">
      {/* Header with Search */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1">
              <FolderTree className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Builds Dashboard</CardTitle>
            </div>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search builds..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-900/50 border-gray-700 text-white" />

            </div>
          </div>
        </CardHeader>
      </Card>



      {/* Projects/Builds Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {projectsLoading ?
        <div className="col-span-full text-center py-8 text-gray-500">Loading builds...</div> :
        filteredProjects.length === 0 ?
        <div className="col-span-full text-center py-8 text-gray-500">
            No builds found matching your search.
          </div> :

        filteredProjects.map((project) => {
          const assignedParts = getProjectAssignedParts(project.id);
          const status = projectStatuses.find((s) => s.id === project.status_id);

          const statusCounts = {
            'On-Hand': assignedParts.filter((p) => p.part?.status === 'On-Hand').length,
            'Need to Buy': assignedParts.filter((p) => p.part?.status === 'Need to Buy').length,
            'On-Order': assignedParts.filter((p) => p.part?.status === 'On-Order').length
          };

          return (
            <Card
              key={project.id}
              className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-900/50 transition-colors">

                <CardHeader className="border-b border-red-900/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-white text-base truncate mb-1">
                        {project.name}
                      </CardTitle>
                      {project.client_name &&
                    <p className="text-xs text-gray-400">Client: {project.client_name}</p>
                    }
                      {project.vin &&
                    <p className="text-xs text-gray-400 font-mono">VIN: {project.vin}</p>
                    }
                    </div>
                    {status &&
                  <Badge
                    style={{ backgroundColor: status.color }}
                    className="text-white text-xs shrink-0">

                        {status.label}
                      </Badge>
                  }
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Parts Summary */}
                    <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-400">Total Parts:</span>
                      </div>
                      <span className="text-white font-semibold">{assignedParts.length}</span>
                    </div>

                    {/* Status Breakdown */}
                    {assignedParts.length > 0 &&
                  <div className="grid grid-cols-3 gap-2">
                        <div className="p-2 bg-gray-900/50 rounded text-center border border-green-900/30">
                          <p className="text-xs text-gray-400 mb-1">On-Hand</p>
                          <p className="text-green-400 font-semibold">{statusCounts['On-Hand']}</p>
                        </div>
                        <div className="p-2 bg-gray-900/50 rounded text-center border border-red-900/30">
                          <p className="text-xs text-gray-400 mb-1">Need to Buy</p>
                          <p className="text-red-400 font-semibold">{statusCounts['Need to Buy']}</p>
                        </div>
                        <div className="p-2 bg-gray-900/50 rounded text-center border border-yellow-900/30">
                          <p className="text-xs text-gray-400 mb-1">On Order</p>
                          <p className="text-yellow-400 font-semibold">{statusCounts['On-Order']}</p>
                        </div>
                      </div>
                  }

                    {/* Recent Parts List */}
                    {assignedParts.length > 0 &&
                  <div className="space-y-2">
                        <p className="text-xs text-gray-400 font-medium">Assigned Parts:</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {assignedParts.slice(0, 5).map(({ assignment, part }) =>
                      <div
                        key={assignment.id}
                        onClick={() => onPartClick(part)}
                        className="flex items-center justify-between p-2 bg-gray-900/30 rounded text-xs cursor-pointer hover:bg-gray-900/50">

                              <span className="text-white truncate flex-1">{part.part_name}</span>
                              <Badge
                          variant="outline"
                          className={`text-xs ml-2 shrink-0 ${
                          part.status === 'On-Hand' ? 'border-green-500 text-green-400' :
                          part.status === 'Need to Buy' ? 'border-red-500 text-red-400' :
                          'border-yellow-500 text-yellow-400'}`
                          }>

                                {part.status}
                              </Badge>
                            </div>
                      )}
                          {assignedParts.length > 5 &&
                      <p className="text-xs text-gray-500 text-center pt-1">
                              +{assignedParts.length - 5} more parts
                            </p>
                      }
                        </div>
                      </div>
                  }

                    {assignedParts.length === 0 &&
                  <div className="text-center py-4">
                        <p className="text-sm text-gray-500">No parts assigned yet</p>
                        <p className="text-xs text-gray-600 mt-1">Parts marked as Global are available</p>
                      </div>
                  }

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <Link
                      to={createPageUrl(`ProjectDetail?id=${project.id}&tab=parts`)}
                      className="flex-1">

                        <Button
                        variant="outline"
                        size="sm" className="bg-lime-600 text-slate-50 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-full border-gray-700 hover:border-red-900/50 gap-2">


                          <Eye className="w-4 h-4" />
                          View Parts
                        </Button>
                      </Link>
                      <Link
                      to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                      className="flex-1">

                        <Button
                        variant="outline"
                        size="sm" className="bg-gray-700 text-slate-50 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-full border-gray-700 hover:border-red-900/50">


                          Open Build
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>);

        })
        }
      </div>
    </div>);

}