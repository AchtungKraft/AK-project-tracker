import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectTypesConfig from "../components/admin/ProjectTypesConfig";
import TaskCategoriesConfig from "../components/admin/TaskCategoriesConfig";
import StatusListConfig from "../components/admin/StatusListConfig";
import TeamMembersConfig from "../components/admin/TeamMembersConfig";
import PartCategoriesConfig from "../components/admin/PartCategoriesConfig";
import VendorsConfig from "../components/admin/VendorsConfig";
import LocationsConfig from "../components/admin/LocationsConfig";
import CarMakesConfig from "../components/admin/CarMakesConfig";
import CarModelsConfig from "../components/admin/CarModelsConfig";
import CarYearsConfig from "../components/admin/CarYearsConfig";
import UsersConfig from "../components/admin/UsersConfig";

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
          <TabsList className="bg-gray-900/50 border border-red-900/30 flex-wrap">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="team-members">Team Members</TabsTrigger>
            <TabsTrigger value="project-types">Project Types</TabsTrigger>
            <TabsTrigger value="task-categories">Task Categories</TabsTrigger>
            <TabsTrigger value="statuses">Status Lists</TabsTrigger>
            <TabsTrigger value="part-categories">Part Categories</TabsTrigger>
            <TabsTrigger value="vendors">Vendors</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="car-makes">Car Makes</TabsTrigger>
            <TabsTrigger value="car-models">Car Models</TabsTrigger>
            <TabsTrigger value="car-years">Car Years</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <UsersConfig />
          </TabsContent>

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

          <TabsContent value="part-categories" className="mt-6">
            <PartCategoriesConfig />
          </TabsContent>

          <TabsContent value="vendors" className="mt-6">
            <VendorsConfig />
          </TabsContent>

          <TabsContent value="locations" className="mt-6">
            <LocationsConfig />
          </TabsContent>

          <TabsContent value="car-makes" className="mt-6">
            <CarMakesConfig />
          </TabsContent>

          <TabsContent value="car-models" className="mt-6">
            <CarModelsConfig />
          </TabsContent>

          <TabsContent value="car-years" className="mt-6">
            <CarYearsConfig />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}