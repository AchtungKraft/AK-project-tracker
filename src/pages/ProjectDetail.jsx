import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Menu, LayoutGrid, ListChecks, Package, BookOpen, Users, Loader2, Edit2 } from "lucide-react";
import EditProjectModal from "../components/dashboard/EditProjectModal";
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
import { useIsMobile } from "@/components/mobile/useIsMobile";

import ProjectOverview from "../components/project/ProjectOverview";
import ProjectTasks from "../components/project/ProjectTasks";
import ProjectParts from "../components/project/ProjectParts";
import ProjectJournal from "../components/project/ProjectJournal";
import ProjectClientPortal from "../components/project/ProjectClientPortal";

export default function ProjectDetail() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const tabParam = urlParams.get('tab') || 'overview';
  const fromPage = urlParams.get('from');
  const fromTab = urlParams.get('fromTab');
  const [activeTab, setActiveTab] = useState(tabParam);
  const [showEditModal, setShowEditModal] = useState(false);

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

  // Centralized data fetching to avoid rate limiting
  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['taskCategories'],
    queryFn: () => base44.entities.TaskCategory.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: projectTasks = [] } = useQuery({
    queryKey: ['projectTasks', projectId],
    queryFn: () => base44.entities.Task.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: projectBuckets = [] } = useQuery({
    queryKey: ['projectBuckets', projectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: allTaskComments = [] } = useQuery({
    queryKey: ['allTaskComments'],
    queryFn: () => base44.entities.TaskComment.list(),
  });

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['journalEntries', projectId],
    queryFn: () => base44.entities.JournalEntry.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  // Memoized comment count map
  const commentCountByTaskId = useMemo(() => {
    const map = {};
    allTaskComments.forEach(comment => {
      map[comment.task_id] = (map[comment.task_id] || 0) + 1;
    });
    return map;
  }, [allTaskComments]);

  // Shared data object to pass to child components
  const sharedData = {
    statuses,
    projectTypes,
    categories,
    teamMembers,
    projectTasks,
    projectBuckets,
    journalEntries,
    commentCountByTaskId,
  };

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
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black ${isMobile ? 'p-2' : 'p-4 md:p-8'}`}>
      <div className={`max-w-7xl mx-auto ${isMobile ? 'space-y-3' : 'space-y-6'}`}>
        {/* Compact Mobile Header */}
        <div className={`flex items-center justify-between ${isMobile ? 'gap-2' : ''}`}>
          <div className={`flex items-center ${isMobile ? 'gap-2 flex-1 min-w-0' : 'gap-4'}`}>
            <Button
              variant="outline"
              size="icon"
              onClick={handleBack}
              className={`border-gray-700 text-white shrink-0 ${isMobile ? 'h-9 w-9' : ''}`}
            >
              <ArrowLeft className={isMobile ? 'w-4 h-4' : 'w-4 h-4'} />
            </Button>
            <div className={isMobile ? 'min-w-0 flex-1' : ''}>
              <h1 className={`font-bold text-white ${isMobile ? 'text-lg truncate' : 'text-2xl md:text-3xl'}`}>{project.name}</h1>
              <p className={`text-gray-400 ${isMobile ? 'text-xs truncate' : ''}`}>{project.client_name || 'No client'}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowEditModal(true)}
            className={`border-gray-700 text-white shrink-0 ${isMobile ? 'h-9 px-2 gap-1' : 'gap-2'}`}
          >
            <Edit2 className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            {!isMobile && 'Edit Project'}
          </Button>
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

          <TabsContent value="overview" className={isMobile ? 'mt-3' : 'mt-6'}>
            <ProjectOverview project={project} projectId={projectId} sharedData={sharedData} />
          </TabsContent>

          <TabsContent value="tasks" className={isMobile ? 'mt-3' : 'mt-6'}>
            <ProjectTasks projectId={projectId} sharedData={sharedData} />
          </TabsContent>

          <TabsContent value="parts" className={isMobile ? 'mt-3' : 'mt-6'}>
            <ProjectParts projectId={projectId} />
          </TabsContent>

          <TabsContent value="journal" className={isMobile ? 'mt-3' : 'mt-6'}>
            <ProjectJournal projectId={projectId} />
          </TabsContent>

          <TabsContent value="clientportal" className={isMobile ? 'mt-3' : 'mt-6'}>
            <ProjectClientPortal projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>

      {showEditModal && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>);

}