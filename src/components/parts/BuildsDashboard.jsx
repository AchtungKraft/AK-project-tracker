import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Package, CheckCircle2, AlertTriangle, Wrench, Eye } from "lucide-react";

/**
 * BuildsDashboard - Shows projects with their part requirements
 * Now uses PartProjectRequirement instead of PartBuildAssignment
 */
export default function BuildsDashboard({ onPartClick }) {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date')
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list()
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statusList'],
    queryFn: () => base44.entities.StatusList.list()
  });

  const { data: installedParts = [] } = useQuery({
    queryKey: ['installedParts'],
    queryFn: () => base44.entities.InstalledPart.list()
  });

  // Filter projects that have requirements
  const projectsWithRequirements = projects.filter(project => 
    requirements.some(r => r.project_id === project.id)
  );

  const filteredProjects = projectsWithRequirements.filter(project => 
    project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.vin?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProjectStats = (projectId) => {
    const projectReqs = requirements.filter(r => r.project_id === projectId);
    const projectInstalled = installedParts.filter(ip => ip.project_id === projectId);
    
    const totalNeeded = projectReqs.reduce((sum, r) => sum + (r.qty_needed || 0), 0);
    const totalAllocated = projectReqs.reduce((sum, r) => sum + (r.qty_allocated || 0), 0);
    const totalInstalled = projectReqs.reduce((sum, r) => sum + (r.qty_installed || 0), 0);
    const toOrder = projectReqs.reduce((sum, r) => {
      return sum + Math.max(0, (r.qty_needed || 0) - (r.qty_allocated || 0) - (r.qty_ordered || 0));
    }, 0);
    
    const partsCost = projectInstalled.reduce((sum, ip) => sum + (ip.extended_cost || 0), 0);

    return {
      totalParts: projectReqs.length,
      totalNeeded,
      totalAllocated,
      totalInstalled,
      toOrder,
      partsCost
    };
  };

  const getStatusInfo = (statusId) => {
    const status = statuses.find(s => s.id === statusId);
    return status ? { label: status.label, color: status.color } : { label: 'Unknown', color: '#6B7280' };
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search builds by name, client, or VIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-gray-900/50 border-gray-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Projects Grid */}
      {projectsLoading ? (
        <div className="text-center py-8 text-gray-500">Loading builds...</div>
      ) : filteredProjects.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400">
              {projectsWithRequirements.length === 0 
                ? 'No builds have part requirements yet'
                : 'No builds match your search'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(project => {
            const stats = getProjectStats(project.id);
            const statusInfo = getStatusInfo(project.status_id);
            const percentComplete = stats.totalNeeded > 0 
              ? Math.round((stats.totalInstalled / stats.totalNeeded) * 100) 
              : 0;

            return (
              <Card key={project.id} className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-900/50 transition-colors">
                <CardHeader className="border-b border-red-900/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-white text-base truncate">
                        {project.name}
                      </CardTitle>
                      {project.client_name && (
                        <p className="text-xs text-gray-400 mt-1">{project.client_name}</p>
                      )}
                    </div>
                    <Badge style={{ backgroundColor: statusInfo.color }} className="text-white text-xs shrink-0">
                      {statusInfo.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Parts Progress</span>
                      <span className="text-white">{percentComplete}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentComplete}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="p-2 bg-gray-900/50 rounded text-center">
                      <p className="text-xs text-gray-500">Parts</p>
                      <p className="text-lg font-bold text-white">{stats.totalParts}</p>
                    </div>
                    <div className="p-2 bg-gray-900/50 rounded text-center">
                      <p className="text-xs text-gray-500">Needed</p>
                      <p className="text-lg font-bold text-white">{stats.totalNeeded}</p>
                    </div>
                    <div className="p-2 bg-gray-900/50 rounded text-center">
                      <p className="text-xs text-gray-500">Installed</p>
                      <p className="text-lg font-bold text-green-400">{stats.totalInstalled}</p>
                    </div>
                    <div className="p-2 bg-gray-900/50 rounded text-center">
                      <p className="text-xs text-gray-500">To Order</p>
                      <p className={`text-lg font-bold ${stats.toOrder > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {stats.toOrder}
                      </p>
                    </div>
                  </div>

                  {/* Cost */}
                  <div className="p-2 bg-yellow-900/20 border border-yellow-900/30 rounded mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Parts Cost</span>
                      <span className="text-yellow-400 font-bold">${stats.partsCost.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Status Indicators */}
                  <div className="flex gap-2 mb-4">
                    {stats.totalInstalled >= stats.totalNeeded && stats.totalNeeded > 0 && (
                      <Badge className="bg-green-600 text-white text-xs gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Complete
                      </Badge>
                    )}
                    {stats.toOrder > 0 && (
                      <Badge className="bg-red-600 text-white text-xs gap-1">
                        <AlertTriangle className="w-3 h-3" /> Needs Order
                      </Badge>
                    )}
                    {stats.totalAllocated > stats.totalInstalled && (
                      <Badge className="bg-blue-600 text-white text-xs gap-1">
                        <Wrench className="w-3 h-3" /> Ready to Install
                      </Badge>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)} className="flex-1">
                      <Button size="sm" className="w-full bg-red-600 hover:bg-red-700 gap-1">
                        <Eye className="w-3 h-3" /> View Build
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}