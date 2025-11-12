import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Search, MoreVertical, Eye, Edit2, Copy, Archive, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import ProjectViewDrawer from "./ProjectViewDrawer";
import EditProjectModal from "./EditProjectModal";

const FILTER_STORAGE_KEY = 'achtung_project_filters';

export default function ProjectsTable({ projects, statuses, isLoading }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedProject, setSelectedProject] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [inlineEditingStatus, setInlineEditingStatus] = useState({});

  // Load filters from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const filters = JSON.parse(saved);
        setSearchTerm(filters.searchTerm || '');
        setStatusFilter(filters.statusFilter || 'all');
        setTypeFilter(filters.typeFilter || 'all');
      }
    } catch (e) {}
  }, []);

  // Save filters to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        searchTerm,
        statusFilter,
        typeFilter,
      }));
    } catch (e) {}
  }, [searchTerm, statusFilter, typeFilter]);

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ projectId, status_id }) => 
      base44.entities.Project.update(projectId, { status_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Status updated');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (project) => {
      const { id, created_date, updated_date, created_by, ...dataWithoutMeta } = project;
      return base44.entities.Project.create({
        ...dataWithoutMeta,
        name: `${project.name} (Copy)`,
        progress_percent: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project duplicated');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (projectId) => {
      const archivedStatus = statuses.find(s => 
        s.scope === 'Project' && s.label.toLowerCase() === 'archived'
      );
      if (!archivedStatus) {
        throw new Error('Archived status not found');
      }
      return base44.entities.Project.update(projectId, { status_id: archivedStatus.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project archived');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
    },
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.vin?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status_id === statusFilter;
    const matchesType = typeFilter === 'all' || p.project_type_id === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const groupedProjects = {};
  filteredProjects.forEach(project => {
    const status = statuses.find(s => s.id === project.status_id);
    const statusLabel = status?.label || 'No Status';
    if (!groupedProjects[statusLabel]) {
      groupedProjects[statusLabel] = [];
    }
    groupedProjects[statusLabel].push(project);
  });

  const getTeamNames = (teamIds) => {
    if (!teamIds || teamIds.length === 0) return '-';
    return teamIds.map(id => {
      const member = teamMembers.find(m => m.id === id);
      return member?.full_name?.split(' ')[0] || 'Unknown';
    }).join(', ');
  };

  const handleInlineStatusChange = (projectId, newStatusId) => {
    updateStatusMutation.mutate({ projectId, status_id: newStatusId });
    setInlineEditingStatus({ ...inlineEditingStatus, [projectId]: false });
  };

  const handleDuplicate = (project) => {
    if (confirm('Duplicate this project?')) {
      duplicateMutation.mutate(project);
    }
  };

  const handleArchive = (projectId) => {
    if (confirm('Archive this project?')) {
      archiveMutation.mutate(projectId);
    }
  };

  const handleDelete = (projectId) => {
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteMutation.mutate(projectId);
    }
  };

  return (
    <>
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <CardTitle className="text-xl font-bold text-white">All Projects</CardTitle>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40 bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {projectStatuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-40 bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {projectTypes.filter(t => t.active).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-gray-800" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {Object.keys(groupedProjects).length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No projects found
                </div>
              ) : (
                Object.entries(groupedProjects).map(([statusLabel, statusProjects]) => {
                  const status = statuses.find(s => s.label === statusLabel);
                  return (
                    <div key={statusLabel}>
                      <div className="px-6 py-3 bg-gray-900/50 border-b border-red-900/20">
                        <Badge 
                          style={{ backgroundColor: status?.color || '#EF4444' }}
                          className="text-white"
                        >
                          {statusLabel} ({statusProjects.length})
                        </Badge>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-red-900/20 hover:bg-transparent">
                            <TableHead className="text-gray-400">Project</TableHead>
                            <TableHead className="text-gray-400">Client</TableHead>
                            <TableHead className="text-gray-400 hidden md:table-cell">Type</TableHead>
                            <TableHead className="text-gray-400 hidden lg:table-cell">Progress</TableHead>
                            <TableHead className="text-gray-400 hidden xl:table-cell">Due</TableHead>
                            <TableHead className="text-gray-400 hidden xl:table-cell">Team</TableHead>
                            <TableHead className="text-gray-400 w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statusProjects.map(project => {
                            const projectType = projectTypes.find(t => t.id === project.project_type_id);
                            const isOverdue = project.target_completion && 
                                            new Date(project.target_completion) < new Date() &&
                                            status?.label?.toLowerCase() !== 'completed';
                            
                            return (
                              <TableRow 
                                key={project.id}
                                className="border-b border-red-900/10 hover:bg-red-950/20 transition-colors"
                              >
                                <TableCell 
                                  className="font-medium text-white cursor-pointer"
                                  onClick={() => setSelectedProject(project.id)}
                                >
                                  <div>
                                    <div>{project.name}</div>
                                    {project.vin && (
                                      <div className="text-xs text-gray-500 mt-1">VIN: {project.vin}</div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-gray-300">{project.client_name || '-'}</TableCell>
                                <TableCell className="text-gray-300 hidden md:table-cell">
                                  {projectType?.name || '-'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <div className="flex items-center gap-2">
                                    <Progress 
                                      value={project.progress_percent || 0} 
                                      className="h-2 w-20 bg-gray-800"
                                    />
                                    <span className="text-sm text-gray-400">
                                      {project.progress_percent || 0}%
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden xl:table-cell">
                                  {project.target_completion ? (
                                    <span className={isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}>
                                      {format(new Date(project.target_completion), 'MMM d, yyyy')}
                                    </span>
                                  ) : '-'}
                                </TableCell>
                                <TableCell className="text-gray-400 text-sm hidden xl:table-cell">
                                  {getTeamNames(project.assigned_team)}
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="w-4 h-4 text-gray-400" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
                                      <DropdownMenuItem 
                                        onClick={() => setSelectedProject(project.id)}
                                        className="text-white hover:bg-gray-700 cursor-pointer"
                                      >
                                        <Eye className="w-4 h-4 mr-2" />
                                        View
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => setEditingProject(project)}
                                        className="text-white hover:bg-gray-700 cursor-pointer"
                                      >
                                        <Edit2 className="w-4 h-4 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDuplicate(project)}
                                        className="text-white hover:bg-gray-700 cursor-pointer"
                                      >
                                        <Copy className="w-4 h-4 mr-2" />
                                        Duplicate
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator className="bg-gray-700" />
                                      <DropdownMenuItem 
                                        onClick={() => handleArchive(project.id)}
                                        className="text-white hover:bg-gray-700 cursor-pointer"
                                      >
                                        <Archive className="w-4 h-4 mr-2" />
                                        Archive
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleDelete(project.id)}
                                        className="text-red-400 hover:bg-gray-700 cursor-pointer"
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProject && (
        <ProjectViewDrawer
          projectId={selectedProject}
          onClose={() => setSelectedProject(null)}
          onEdit={(project) => {
            setSelectedProject(null);
            setEditingProject(project);
          }}
        />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
    </>
  );
}