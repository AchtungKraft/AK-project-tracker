import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectTypesConfig from "../components/admin/ProjectTypesConfig";
import TaskCategoriesConfig from "../components/admin/TaskCategoriesConfig";
import StatusListConfig from "../components/admin/StatusListConfig";
import TeamMembersConfig from "../components/admin/TeamMembersConfig";

export default function AdminConfig() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Admin Configuration
          </h1>
          <p className="text-gray-400">Manage dropdown lists and team members</p>
        </div>

        <Tabs defaultValue="project-types" className="w-full">
          <TabsList className="bg-gray-900/50 border border-red-900/30">
            <TabsTrigger value="project-types">Project Types</TabsTrigger>
            <TabsTrigger value="task-categories">Task Categories</TabsTrigger>
            <TabsTrigger value="statuses">Status Lists</TabsTrigger>
            <TabsTrigger value="team-members">Team Members</TabsTrigger>
          </TabsList>

          <TabsContent value="project-types" className="mt-6">
            <ProjectTypesConfig />
          </TabsContent>

          <TabsContent value="task-categories" className="mt-6">
            <TaskCategoriesConfig />
          </TabsContent>

          <TabsContent value="statuses" className="mt-6">
            <StatusListConfig />
          </TabsContent>

          <TabsContent value="team-members" className="mt-6">
            <TeamMembersConfig />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}