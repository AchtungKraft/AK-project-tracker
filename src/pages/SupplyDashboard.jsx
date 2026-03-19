import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import ProjectSupplyDashboard from "@/components/supply/ProjectSupplyDashboard";

/**
 * SupplyDashboard Page - Route wrapper for ProjectSupplyDashboard
 * Fetches projects and statuses, then passes them as props.
 */
export default function SupplyDashboard() {
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.filter({ is_system_project: { $ne: true } })
  });

  const { data: statuses = [], isLoading: loadingStatuses } = useQuery({
    queryKey: ['statusList'],
    queryFn: () => base44.entities.StatusList.filter({ scope: 'Project' })
  });

  if (loadingProjects || loadingStatuses) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return <ProjectSupplyDashboard projects={projects} statuses={statuses} />;
}