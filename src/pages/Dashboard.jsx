import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, RefreshCw, LayoutGrid, List, X, Check } from "lucide-react";
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
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CreateProjectModal from "../components/dashboard/CreateProjectModal";
import ProjectCard from "../components/dashboard/ProjectCard";
import ProjectListView from "../components/dashboard/ProjectListView";
import EditProjectModal from "../components/dashboard/EditProjectModal";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [groupBy, setGroupBy] = useState('projectType');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('cards');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: async () => {
      const list = await base44.entities.StatusList.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: async () => {
      const list = await base44.entities.ProjectType.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: async () => {
      const list = await base44.entities.TeamMember.list();
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.vin?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status_id === statusFilter;
    const matchesType = selectedTypes.length === 0 || selectedTypes.includes(p.project_type_id);
    return matchesSearch && matchesStatus && matchesType;
  });

  // Group projects
  const groupedProjects = {};
  filteredProjects.forEach(project => {
    let groupKey = 'Ungrouped';
    let groupColor = '#6B7280';
    
    if (groupBy === 'projectType') {
      const projectType = projectTypes.find(t => t.id === project.project_type_id);
      groupKey = projectType?.name || 'No Type';
      groupColor = projectType?.color || '#6B7280';
    } else if (groupBy === 'status') {
      const status = statuses.find(s => s.id === project.status_id);
      groupKey = status?.label || 'No Status';
      groupColor = status?.color || '#6B7280';
    } else if (groupBy === 'client') {
      groupKey = project.client_name || 'No Client';
      groupColor = '#3B82F6';
    }
    
    if (!groupedProjects[groupKey]) {
      groupedProjects[groupKey] = { projects: [], color: groupColor };
    }
    groupedProjects[groupKey].projects.push(project);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
              PROJECT DASHBOARD
            </h1>
            <p className="text-sm text-gray-400">Ächtung Kraft Project Tracking Platform</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                setIsRefreshing(true);
                await queryClient.invalidateQueries();
                setIsRefreshing(false);
              }}
              variant="outline"
              className="border-gray-700 text-white gap-2"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-5 h-5" />
              New Project
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="md:col-span-4 lg:col-span-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-gray-700 text-white"
                />
              </div>
            </div>

            {/* Group By */}
            <div>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="Group By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="projectType">Group by Type</SelectItem>
                  <SelectItem value="status">Group by Status</SelectItem>
                  <SelectItem value="client">Group by Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {projectStatuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter - Multi-select */}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full justify-between bg-gray-900/50 border-gray-700 text-white hover:bg-gray-800"
                  >
                    <span className="truncate">
                      {selectedTypes.length === 0 
                        ? 'All Types' 
                        : selectedTypes.length === 1 
                          ? projectTypes.find(t => t.id === selectedTypes[0])?.name || 'Type'
                          : `${selectedTypes.length} Types`}
                    </span>
                    {selectedTypes.length > 0 && (
                      <X 
                        className="w-4 h-4 ml-2 hover:text-red-400" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTypes([]);
                        }}
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {projectTypes.filter(t => t.active).map(t => (
                    <DropdownMenuCheckboxItem
                      key={t.id}
                      checked={selectedTypes.includes(t.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTypes([...selectedTypes, t.id]);
                        } else {
                          setSelectedTypes(selectedTypes.filter(id => id !== t.id));
                        }
                      }}
                    >
                      <span 
                        className="w-2 h-2 rounded-full mr-2" 
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Projects Grid */}
        {projectsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-96 bg-gray-800" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-8 text-center">
            <p className="text-gray-500 text-lg">No projects found</p>
            <p className="text-gray-600 mt-2">Create your first project to get started</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedProjects).sort((a, b) => {
              if (groupBy === 'projectType') {
                const typeA = projectTypes.find(t => t.name === a[0]);
                const typeB = projectTypes.find(t => t.name === b[0]);
                return (typeA?.sort_order || 0) - (typeB?.sort_order || 0);
              } else if (groupBy === 'status') {
                const statusA = statuses.find(s => s.label === a[0]);
                const statusB = statuses.find(s => s.label === b[0]);
                return (statusA?.sort_order || 0) - (statusB?.sort_order || 0);
              }
              return 0;
            }).map(([groupLabel, groupData]) => {
              const { projects: groupProjects, color: groupColor } = groupData;
              
              return (
                <div key={groupLabel}>
                  <div className="mb-4 pb-2 border-b-2 border-l-4 pl-3" style={{ borderColor: groupColor }}>
                    <h2 className="text-xl font-bold" style={{ color: groupColor }}>
                      {groupLabel} ({groupProjects.length})
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupProjects.map(project => {
                      const status = statuses.find(s => s.id === project.status_id);
                      const projectType = projectTypes.find(t => t.id === project.project_type_id);
                      
                      return (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          status={status}
                          projectType={projectType}
                          teamMembers={teamMembers}
                          onEdit={setEditingProject}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProjectModal onClose={() => setShowCreateModal(false)} />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
    </div>
  );
}