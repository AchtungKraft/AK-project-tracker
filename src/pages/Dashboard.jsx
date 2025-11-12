import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  Plus, 
  FolderKanban, 
  AlertCircle, 
  TrendingUp,
  Users,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatsCard from "../components/dashboard/StatsCard";
import ProjectsTable from "../components/dashboard/ProjectsTable";
import CreateProjectModal from "../components/dashboard/CreateProjectModal";

export default function Dashboard() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const activeProjects = projects.filter(p => {
    const status = statuses.find(s => s.id === p.status_id);
    return status?.label?.toLowerCase() !== 'completed' && status?.label?.toLowerCase() !== 'archived';
  });

  const overdueProjects = projects.filter(p => {
    if (!p.target_completion) return false;
    const status = statuses.find(s => s.id === p.status_id);
    if (status?.label?.toLowerCase() === 'completed') return false;
    return new Date(p.target_completion) < new Date();
  });

  const avgProgress = projects.length > 0 
    ? Math.round(projects.reduce((sum, p) => sum + (p.progress_percent || 0), 0) / projects.length)
    : 0;

  const teamLoad = projects.filter(p => 
    p.assigned_team?.includes(user?.id)
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Project Dashboard
            </h1>
            <p className="text-gray-400">Craft. Precision. Passion.</p>
          </div>
          <Button 
            onClick={() => setShowCreateModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Active Projects"
            value={activeProjects.length}
            icon={FolderKanban}
            gradient="from-blue-600 to-blue-800"
          />
          <StatsCard
            title="Overdue Projects"
            value={overdueProjects.length}
            icon={AlertCircle}
            gradient="from-red-600 to-red-800"
          />
          <StatsCard
            title="Avg Progress"
            value={`${avgProgress}%`}
            icon={TrendingUp}
            gradient="from-green-600 to-green-800"
          />
          <StatsCard
            title="My Projects"
            value={teamLoad}
            icon={Users}
            gradient="from-purple-600 to-purple-800"
          />
        </div>

        {/* Projects Table */}
        <ProjectsTable 
          projects={projects}
          statuses={statuses}
          isLoading={isLoading}
        />
      </div>

      {showCreateModal && (
        <CreateProjectModal 
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}