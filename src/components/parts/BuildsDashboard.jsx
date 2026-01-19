import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Search, Package, CheckCircle2, AlertTriangle, Wrench, Eye, 
  ChevronDown, ChevronUp, ShoppingCart, Truck, Download
} from "lucide-react";
import InstallPartModal from "../project/InstallPartModal";

/**
 * BuildsDashboard - Shows projects with their part requirements
 * Enhanced with coverage sections: Installed, Allocated, On Order, Need To Order
 */
export default function BuildsDashboard({ onPartClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProject, setExpandedProject] = useState(null);
  const [installRequirement, setInstallRequirement] = useState(null);

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

  const getProjectData = (projectId) => {
    const projectReqs = requirements.filter(r => r.project_id === projectId);
    const projectInstalled = installedParts.filter(ip => ip.project_id === projectId);
    
    // Categorize requirements by status
    const installed = [];
    const allocated = [];
    const onOrder = [];
    const needToOrder = [];
    
    projectReqs.forEach(req => {
      const part = parts.find(p => p.id === req.part_id);
      if (!part) return;
      
      const item = {
        requirement: req,
        part,
        qty_needed: req.qty_needed || 0,
        qty_allocated: req.qty_allocated || 0,
        qty_ordered: req.qty_ordered || 0,
        qty_installed: req.qty_installed || 0,
      };
      
      // Determine status bucket
      if (item.qty_installed >= item.qty_needed) {
        installed.push({ ...item, status: 'Installed' });
      } else if (item.qty_installed > 0) {
        // Partially installed - still show in installed section
        installed.push({ ...item, status: 'Partially Installed' });
        
        // Check remaining
        const remaining = item.qty_needed - item.qty_installed;
        const allocatedRemaining = item.qty_allocated - item.qty_installed;
        if (allocatedRemaining > 0) {
          allocated.push({ ...item, status: 'Allocated', effective_qty: Math.min(allocatedRemaining, remaining) });
        }
      } else if (item.qty_allocated > 0) {
        allocated.push({ ...item, status: item.qty_allocated >= item.qty_needed ? 'Allocated' : 'Partially Allocated' });
      }
      
      if (item.qty_ordered > 0 && item.qty_installed < item.qty_needed) {
        onOrder.push({ ...item, status: 'On Order' });
      }
      
      // stillNeedToOrder = qty_needed - qty_installed - qty_allocated - qty_ordered
      const stillNeedToOrder = item.qty_needed - item.qty_installed - item.qty_allocated - item.qty_ordered;
      if (stillNeedToOrder > 0) {
        needToOrder.push({ ...item, status: 'Need To Order', qty_to_order: stillNeedToOrder });
      }
    });
    
    // Calculate totals
    const totalNeeded = projectReqs.reduce((sum, r) => sum + (r.qty_needed || 0), 0);
    const totalAllocated = projectReqs.reduce((sum, r) => sum + (r.qty_allocated || 0), 0);
    const totalOnOrder = projectReqs.reduce((sum, r) => sum + (r.qty_ordered || 0), 0);
    const totalInstalled = projectReqs.reduce((sum, r) => sum + (r.qty_installed || 0), 0);
    // toOrder = qty_needed - qty_installed - qty_allocated - qty_ordered
    const toOrder = projectReqs.reduce((sum, r) => 
      sum + Math.max(0, (r.qty_needed || 0) - (r.qty_installed || 0) - (r.qty_allocated || 0) - (r.qty_ordered || 0)), 0);
    const partsCost = projectInstalled.reduce((sum, ip) => sum + (ip.extended_cost || 0), 0);

    return {
      totalParts: projectReqs.length,
      totalNeeded,
      totalAllocated,
      totalOnOrder,
      totalInstalled,
      toOrder,
      partsCost,
      sections: { installed, allocated, onOrder, needToOrder },
    };
  };

  const getStatusInfo = (statusId) => {
    const status = statuses.find(s => s.id === statusId);
    return status ? { label: status.label, color: status.color } : { label: 'Unknown', color: '#6B7280' };
  };

  const toggleProject = (projectId) => {
    setExpandedProject(prev => prev === projectId ? null : projectId);
  };

  const canInstall = (item) => {
    const allocatedNotInstalled = (item.qty_allocated || 0) - (item.qty_installed || 0);
    return allocatedNotInstalled > 0;
  };

  const renderPartRow = (item, showStatus = true, showInstallAction = false) => (
    <div 
      key={item.requirement.id + item.status}
      className="flex items-center gap-3 p-2 hover:bg-gray-800/30 rounded cursor-pointer"
      onClick={() => onPartClick?.(item.part)}
    >
      {item.part.featured_photo && (
        <div className="w-8 h-8 bg-gray-800 rounded overflow-hidden flex-shrink-0">
          <img src={item.part.featured_photo} alt="" className="w-full h-full object-contain" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.part.part_name}</p>
        <p className="text-xs text-gray-500 font-mono">{item.part.vendor_part_number}</p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {showStatus && (
          <Badge variant="outline" className={
            item.status === 'Installed' ? 'border-green-500 text-green-400' :
            item.status === 'Allocated' ? 'border-blue-500 text-blue-400' :
            item.status === 'On Order' ? 'border-yellow-500 text-yellow-400' :
            'border-red-500 text-red-400'
          }>
            {item.status}
          </Badge>
        )}
        <span className="text-gray-400 w-24 text-right">
          {item.qty_installed}/{item.qty_allocated}/{item.qty_needed}
        </span>
        {showInstallAction && canInstall(item) && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 border-green-700 text-green-400 hover:bg-green-900/30"
            onClick={(e) => {
              e.stopPropagation();
              setInstallRequirement(item.requirement);
            }}
          >
            <Download className="w-3 h-3 mr-1" />
            Install
          </Button>
        )}
      </div>
    </div>
  );

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

      {/* Projects List */}
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
        <div className="space-y-3">
          {filteredProjects.map(project => {
            const data = getProjectData(project.id);
            const statusInfo = getStatusInfo(project.status_id);
            const percentComplete = data.totalNeeded > 0 
              ? Math.round((data.totalInstalled / data.totalNeeded) * 100) 
              : 0;
            const isExpanded = expandedProject === project.id;

            return (
              <Card key={project.id} className="bg-black/40 backdrop-blur-xl border border-red-900/30">
                <CardHeader 
                  className="p-4 cursor-pointer hover:bg-red-950/20 transition-colors"
                  onClick={() => toggleProject(project.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-white text-base truncate">
                            {project.name}
                          </CardTitle>
                          <Badge style={{ backgroundColor: statusInfo.color }} className="text-white text-xs">
                            {statusInfo.label}
                          </Badge>
                        </div>
                        {project.client_name && (
                          <p className="text-xs text-gray-400">{project.client_name}</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Summary Stats */}
                    <div className="flex items-center gap-4">
                      <div className="hidden md:flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1 text-green-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{data.totalInstalled}</span>
                        </div>
                        <div className="flex items-center gap-1 text-blue-400">
                          <Package className="w-3 h-3" />
                          <span>{data.totalAllocated}</span>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-400">
                          <Truck className="w-3 h-3" />
                          <span>{data.totalOnOrder}</span>
                        </div>
                        {data.toOrder > 0 && (
                          <div className="flex items-center gap-1 text-red-400">
                            <ShoppingCart className="w-3 h-3" />
                            <span>{data.toOrder}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="w-24">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500">Progress</span>
                          <span className="text-white">{percentComplete}%</span>
                        </div>
                        <Progress value={percentComplete} className="h-1.5" />
                      </div>
                      
                      <Link to={createPageUrl(`ProjectDetail?id=${project.id}&tab=parts`)} onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" className="border-gray-700 gap-1">
                          <Eye className="w-3 h-3" /> View
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-4 pt-0 border-t border-red-900/20">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                      <div className="p-2 bg-gray-900/50 rounded text-center">
                        <p className="text-xs text-gray-500">Total Parts</p>
                        <p className="text-lg font-bold text-white">{data.totalParts}</p>
                      </div>
                      <div className="p-2 bg-gray-900/50 rounded text-center">
                        <p className="text-xs text-gray-500">Installed</p>
                        <p className="text-lg font-bold text-green-400">{data.totalInstalled}</p>
                      </div>
                      <div className="p-2 bg-gray-900/50 rounded text-center">
                        <p className="text-xs text-gray-500">Allocated</p>
                        <p className="text-lg font-bold text-blue-400">{data.totalAllocated}</p>
                      </div>
                      <div className="p-2 bg-gray-900/50 rounded text-center">
                        <p className="text-xs text-gray-500">On Order</p>
                        <p className="text-lg font-bold text-yellow-400">{data.totalOnOrder}</p>
                      </div>
                      <div className="p-2 bg-gray-900/50 rounded text-center">
                        <p className="text-xs text-gray-500">Need to Order</p>
                        <p className={`text-lg font-bold ${data.toOrder > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                          {data.toOrder}
                        </p>
                      </div>
                    </div>

                    {/* Coverage Sections */}
                    <div className="space-y-3">
                      {/* Installed Section */}
                      {data.sections.installed.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-medium text-green-400">Installed ({data.sections.installed.length})</span>
                          </div>
                          <div className="bg-green-900/10 border border-green-900/20 rounded-lg p-2 space-y-1">
                            {data.sections.installed.slice(0, 3).map(item => renderPartRow(item, false))}
                            {data.sections.installed.length > 3 && (
                              <p className="text-xs text-gray-500 text-center py-1">
                                +{data.sections.installed.length - 3} more installed
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Allocated Section - With Install Action */}
                      {data.sections.allocated.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Package className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-blue-400">Reserved / Allocated ({data.sections.allocated.length})</span>
                            <span className="text-xs text-gray-500 ml-auto">Ready to install</span>
                          </div>
                          <div className="bg-blue-900/10 border border-blue-900/20 rounded-lg p-2 space-y-1">
                            {data.sections.allocated.map(item => renderPartRow(item, false, true))}
                          </div>
                        </div>
                      )}

                      {/* On Order Section */}
                      {data.sections.onOrder.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Truck className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm font-medium text-yellow-400">On Order ({data.sections.onOrder.length})</span>
                          </div>
                          <div className="bg-yellow-900/10 border border-yellow-900/20 rounded-lg p-2 space-y-1">
                            {data.sections.onOrder.map(item => renderPartRow(item, false))}
                          </div>
                        </div>
                      )}

                      {/* Need To Order Section */}
                      {data.sections.needToOrder.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <span className="text-sm font-medium text-red-400">Need To Order ({data.sections.needToOrder.length})</span>
                          </div>
                          <div className="bg-red-900/10 border border-red-900/20 rounded-lg p-2 space-y-1">
                            {data.sections.needToOrder.map(item => (
                              <div 
                                key={item.requirement.id}
                                className="flex items-center gap-3 p-2 hover:bg-gray-800/30 rounded cursor-pointer"
                                onClick={() => onPartClick?.(item.part)}
                              >
                                {item.part.featured_photo && (
                                  <div className="w-8 h-8 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                                    <img src={item.part.featured_photo} alt="" className="w-full h-full object-contain" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate">{item.part.part_name}</p>
                                </div>
                                <Badge variant="outline" className="border-red-500 text-red-400">
                                  Order {item.qty_to_order}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Parts Cost */}
                      {data.partsCost > 0 && (
                        <div className="p-2 bg-yellow-900/20 border border-yellow-900/30 rounded">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400">Parts Cost (Installed)</span>
                            <span className="text-yellow-400 font-bold">${data.partsCost.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {installRequirement && (
        <InstallPartModal
          requirement={installRequirement}
          onClose={() => setInstallRequirement(null)}
        />
      )}
    </div>
  );
}