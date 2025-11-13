import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ProjectsTable from "../components/dashboard/ProjectsTable";

export default function Projects() {
  const { data: projects = [], isLoading } = useQuery({
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            All Projects
          </h1>
          <p className="text-gray-400">Manage your custom Porsche builds</p>
        </div>

        <ProjectsTable 
          projects={projects}
          statuses={statuses}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}