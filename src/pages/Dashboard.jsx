import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CreateProjectModal from "../components/dashboard/CreateProjectModal";
import ProjectCard from "../components/dashboard/ProjectCard";
import EditProjectModal from "../components/dashboard/EditProjectModal";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              PROJECT DASHBOARD
            </h1>
            <p className="text-gray-400">Ächtung Kraft Project Tracking Platform</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-5 h-5" />
            New Project
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="md:col-span-3 lg:col-span-1">
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

            {/* Type Filter */}
            <div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white">
                  <SelectValue placeholder="All Types" />
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
        </div>

        {/* Projects Grid */}
        {projectsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-96 bg-gray-800" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-black/40 backdrop-blur-xl border border-red-900/30 rounded-lg p-12 text-center">
            <p className="text-gray-500 text-lg">No projects found</p>
            <p className="text-gray-600 mt-2">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map(project => {
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