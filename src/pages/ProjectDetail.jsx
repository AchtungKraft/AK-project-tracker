import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Menu, LayoutGrid, ListChecks, Package, BookOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import ProjectOverview from "../components/project/ProjectOverview";
import ProjectTasks from "../components/project/ProjectTasks";
import ProjectParts from "../components/project/ProjectParts";
import ProjectJournal from "../components/project/ProjectJournal";
import ProjectClientPortal from "../components/project/ProjectClientPortal";

export default function ProjectDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const tabParam = urlParams.get('tab') || 'overview';
  const fromPage = urlParams.get('from');
  const fromTab = urlParams.get('fromTab');
  const [activeTab, setActiveTab] = useState(tabParam);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else if (fromPage === 'hub') {
      navigate(createPageUrl("ClientPortalHub") + (fromTab ? `?tab=${fromTab}` : ''));
    } else {
      navigate(createPageUrl("Dashboard"));
    }
  };

  useEffect(() => {
    const newTab = urlParams.get('tab') || 'overview';
    setActiveTab(newTab);
  }, [window.location.search]);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }),
    select: (data) => data[0],
    enabled: !!projectId
  });

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        No project ID provided
      </div>);

  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </div>);

  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Project not found
      </div>);

  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={handleBack}
            className="border-gray-700 text-white">

            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{project.name}</h1>
            <p className="text-gray-400">{project.client_name || 'No client'}</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Desktop Tabs */}
          <TabsList className="hidden md:flex bg-black/40 border border-gray-700 p-1 h-auto">
            <TabsTrigger 
              value="overview" 
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
            >
              <LayoutGrid className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="tasks"
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
            >
              <ListChecks className="w-4 h-4" />
              Tasks
            </TabsTrigger>
            <TabsTrigger 
              value="parts"
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
            >
              <Package className="w-4 h-4" />
              Parts
            </TabsTrigger>
            <TabsTrigger 
              value="journal"
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Journal
            </TabsTrigger>
            <TabsTrigger 
              value="clientportal"
              className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-2"
            >
              <Users className="w-4 h-4" />
              Client Portal
            </TabsTrigger>
          </TabsList>

          {/* Mobile Hamburger Menu */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between border-gray-700 text-white bg-black/40">
                  <span className="flex items-center gap-2">
                    {activeTab === 'overview' && <><LayoutGrid className="w-4 h-4" /> Overview</>}
                    {activeTab === 'tasks' && <><ListChecks className="w-4 h-4" /> Tasks</>}
                    {activeTab === 'parts' && <><Package className="w-4 h-4" /> Parts</>}
                    {activeTab === 'journal' && <><BookOpen className="w-4 h-4" /> Journal</>}
                    {activeTab === 'clientportal' && <><Users className="w-4 h-4" /> Client Portal</>}
                  </span>
                  <Menu className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-gray-900 border-gray-700">
                <DropdownMenuItem 
                  onClick={() => setActiveTab('overview')}
                  className={`gap-2 ${activeTab === 'overview' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
                >
                  <LayoutGrid className="w-4 h-4" /> Overview
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveTab('tasks')}
                  className={`gap-2 ${activeTab === 'tasks' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
                >
                  <ListChecks className="w-4 h-4" /> Tasks
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveTab('parts')}
                  className={`gap-2 ${activeTab === 'parts' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
                >
                  <Package className="w-4 h-4" /> Parts
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveTab('journal')}
                  className={`gap-2 ${activeTab === 'journal' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
                >
                  <BookOpen className="w-4 h-4" /> Journal
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setActiveTab('clientportal')}
                  className={`gap-2 ${activeTab === 'clientportal' ? 'bg-red-600 text-white' : 'text-gray-300'}`}
                >
                  <Users className="w-4 h-4" /> Client Portal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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

          <TabsContent value="clientportal" className="mt-6">
            <ProjectClientPortal projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>);

}