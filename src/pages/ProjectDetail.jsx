import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import ProjectOverview from "../components/project/ProjectOverview";
import ProjectTasks from "../components/project/ProjectTasks";
import ProjectParts from "../components/project/ProjectParts";
import ProjectJournal from "../components/project/ProjectJournal";

export default function ProjectDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const tabParam = urlParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(tabParam);

  useEffect(() => {
    const newTab = urlParams.get('tab') || 'overview';
    setActiveTab(newTab);
  }, [window.location.search]);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }),
    select: (data) => data[0],
    enabled: !!projectId,
  });

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        No project ID provided
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Project not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Dashboard"))}
            className="border-gray-700 text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{project.name}</h1>
            <p className="text-gray-400">{project.client_name || 'No client'}</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-gray-900/50 border border-red-900/30">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="parts">Parts</TabsTrigger>
            <TabsTrigger value="journal">Journal</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <ProjectOverview project={project} projectId={projectId} />
          </TabsContent>

          <TabsContent value="tasks" className="mt-6">
            <ProjectTasks projectId={projectId} />
          </TabsContent>

          <TabsContent value="parts" className="mt-6">
            <ProjectParts projectId={projectId} />
          </TabsContent>

          <TabsContent value="journal" className="mt-6">
            <ProjectJournal projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}