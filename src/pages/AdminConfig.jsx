import React, { useState } from "react";
import AdminSidebar from "../components/admin/AdminSidebar";
import AdminBreadcrumb from "../components/admin/AdminBreadcrumb";
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
import EmailTemplatesConfig from "../components/admin/EmailTemplatesConfig";
import RetailMarkupMatrixConfig from "../components/admin/RetailMarkupMatrixConfig";
import PricingStrictModeConfig from "../components/supply/PricingStrictModeConfig";
import VendorGroupsConfig from "../components/admin/VendorGroupsConfig";
import ServiceCatalogConfig from "../components/admin/ServiceCatalogConfig";
import ServiceVendorsConfig from "../components/admin/ServiceVendorsConfig";
import ProjectStorageTemplatesConfig from "../components/admin/ProjectStorageTemplatesConfig";

const PANEL_MAP = {
  "users": UsersConfig,
  "team-members": TeamMembersConfig,
  "locations": LocationsConfig,
  "storage-templates": ProjectStorageTemplatesConfig,
  "project-types": ProjectTypesConfig,
  "task-categories": TaskCategoriesConfig,
  "statuses": StatusListConfig,
  "part-categories": PartCategoriesConfig,
  "service-catalog": ServiceCatalogConfig,
  "vendor-groups": VendorGroupsConfig,
  "vendors": VendorsConfig,
  "service-vendors": ServiceVendorsConfig,
  "pricing-matrix": RetailMarkupMatrixConfig,
  "pricing-guardrails": PricingStrictModeConfig,
  "car-makes": CarMakesConfig,
  "car-models": CarModelsConfig,
  "car-years": CarYearsConfig,
  "email-templates": EmailTemplatesConfig,
};

export default function AdminConfig() {
  const [activeKey, setActiveKey] = useState("project-types");

  const ActivePanel = PANEL_MAP[activeKey];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Admin Configuration
          </h1>
          <p className="text-gray-500 text-sm mt-1">System settings and data management</p>
        </div>

        {/* Mobile sidebar trigger is built into AdminSidebar */}

        {/* Layout: Sidebar + Content */}
        <div className="flex flex-col md:flex-row gap-4">
          <AdminSidebar activeKey={activeKey} onSelect={setActiveKey} />

          {/* Content Panel */}
          <div className="flex-1 min-w-0">
            <AdminBreadcrumb activeKey={activeKey} />
            {ActivePanel ? <ActivePanel /> : (
              <div className="text-gray-500 text-center py-12">Select a section from the sidebar</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}