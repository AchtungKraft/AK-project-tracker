import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Code, Database, FileText, Users, Package, FolderKanban, CheckSquare, MessageSquare, Calendar, Map, FileCode, Shield, GitBranch, AlertTriangle } from "lucide-react";

export default function TechSpecs() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="w-8 h-8 text-red-500" />
          <div>
            <h1 className="text-3xl font-bold text-white">Technical Specifications</h1>
            <p className="text-gray-400">Comprehensive documentation of app pages, functions, and logic</p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-gray-800 border border-gray-700 flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="entities">Entities</TabsTrigger>
            <TabsTrigger value="functions">Backend Functions</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="systemmap">System Map</TabsTrigger>
            <TabsTrigger value="pagecontracts">Page Contracts</TabsTrigger>
            <TabsTrigger value="rules">Rules Catalog</TabsTrigger>
            <TabsTrigger value="changes">Change Management</TabsTrigger>
            <TabsTrigger value="clientportal">Client Portal Logic</TabsTrigger>
            <TabsTrigger value="apisync">API Sync Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Application Architecture</CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Core Functionality</h3>
                  <p>This application is a project management and client portal system for automotive builds, tracking projects, tasks, parts inventory, and client feedback.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">User Roles</h3>
                  <ul className="list-disc list-inside space-y-1">
                    <li><Badge className="bg-red-600">Achtung Kraft Members</Badge> - Full access to all features</li>
                    <li><Badge className="bg-blue-600">Company Users</Badge> - Limited access to their company's projects</li>
                    <li><Badge className="bg-green-600">Client Contacts</Badge> - Portal access to assigned projects</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Key Features</h3>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Project & Task Management with Kanban boards</li>
                    <li>Parts Inventory Tracking</li>
                    <li>Client Portal with Feedback Requests</li>
                    <li>Journal/Activity Logging</li>
                    <li>Team Member Management</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pages" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-red-500" />
                  Dashboard & Projects
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-3">
                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">Dashboard</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">Dashboard</code></p>
                  <p className="mt-2">Main overview page for Achtung Kraft members showing:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Active projects grid/list view</li>
                    <li>Quick stats and metrics</li>
                    <li>Recent activity</li>
                  </ul>
                </div>

                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">PriorityDashboard</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">PriorityDashboard</code></p>
                  <p className="mt-2">Priority task view showing high-priority items across all projects</p>
                </div>

                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">Projects</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">Projects</code></p>
                  <p className="mt-2">Master projects list with filtering and search capabilities</p>
                </div>

                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">ProjectDetail</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">ProjectDetail?id=PROJECT_ID</code></p>
                  <p className="mt-2">Detailed project view with tabs:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li><strong>Overview</strong> - Project info, images, team</li>
                    <li><strong>Tasks</strong> - Task management and Kanban board</li>
                    <li><strong>Parts</strong> - Project parts assignments</li>
                    <li><strong>Journal</strong> - Activity log and updates</li>
                    <li><strong>Client Portal</strong> - Feedback requests management</li>
                  </ul>
                </div>

                <div className="border-l-2 border-blue-600 pl-4">
                  <h4 className="font-semibold text-white">MyProjects</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">MyProjects</code></p>
                  <p className="mt-2">Company user view - shows only projects assigned to their company</p>
                </div>

                <div className="border-l-2 border-blue-600 pl-4">
                  <h4 className="font-semibold text-white">MyPriorities</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">MyPriorities</code></p>
                  <p className="mt-2">Company user view - shows priority tasks for their projects</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-red-500" />
                  Tasks
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-3">
                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">TasksExplorer</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">TasksExplorer</code></p>
                  <p className="mt-2">Master task list across all projects with:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Filtering by project, category, status, assignee</li>
                    <li>Grid/List view toggle</li>
                    <li>Task detail drawer for editing</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-red-500" />
                  Parts Management
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-3">
                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">PartsTracker</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">PartsTracker</code></p>
                  <p className="mt-2">Master parts inventory with tabs:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li><strong>Master List</strong> - All parts inventory</li>
                    <li><strong>On Order</strong> - Parts being ordered</li>
                    <li><strong>Need to Buy</strong> - Parts needed</li>
                    <li><strong>Builds Dashboard</strong> - Parts by project</li>
                    <li><strong>Locations</strong> - Inventory locations</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-red-500" />
                  Client Portal Pages
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-3">
                <div className="border-l-2 border-green-600 pl-4">
                  <h4 className="font-semibold text-white">ClientProjects</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">ClientProjects?slug=CLIENT_SLUG</code></p>
                  <p className="mt-2">Public client portal - lists all projects the client has access to</p>
                  <p className="text-xs text-gray-500 mt-1">No authentication required - uses slug-based access</p>
                </div>

                <div className="border-l-2 border-green-600 pl-4">
                  <h4 className="font-semibold text-white">ClientProjectPortal</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">ClientProjectPortal?slug=CLIENT_SLUG&projectId=PROJECT_ID</code></p>
                  <p className="mt-2">Client view of a specific project showing:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Feedback requests grouped by status</li>
                    <li>Search and sort functionality</li>
                    <li>Request type indicators</li>
                  </ul>
                </div>

                <div className="border-l-2 border-green-600 pl-4">
                  <h4 className="font-semibold text-white">ClientFeedbackRequestDetail</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">ClientFeedbackRequestDetail?slug=CLIENT_SLUG&requestId=REQUEST_ID</code></p>
                  <p className="mt-2">Public client view of feedback request with:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Threaded comments and decisions</li>
                    <li>Image review with approve/change requests</li>
                    <li>File attachments and links</li>
                    <li>Add comments functionality</li>
                  </ul>
                </div>

                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">ClientFeedbackDetail (Internal)</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">ClientFeedbackDetail?id=REQUEST_ID&projectId=PROJECT_ID</code></p>
                  <p className="mt-2">Internal authenticated view with additional controls:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Post to client / Archive / Delete</li>
                    <li>Internal-only comments</li>
                    <li>Request status management</li>
                    <li>Create tasks from approvals</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-red-500" />
                  Admin & Config
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-3">
                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">AdminConfig</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">AdminConfig</code></p>
                  <p className="mt-2">Configuration management for:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Team Members</li>
                    <li>Users</li>
                    <li>Project Types</li>
                    <li>Task Categories</li>
                    <li>Status Lists</li>
                    <li>Part Categories</li>
                    <li>Vendors</li>
                    <li>Locations</li>
                    <li>Car Makes/Models/Years</li>
                  </ul>
                </div>

                <div className="border-l-2 border-red-500 pl-4">
                  <h4 className="font-semibold text-white">Reports</h4>
                  <p className="text-sm text-gray-400">Route: <code className="bg-gray-800 px-2 py-0.5 rounded">Reports</code></p>
                  <p className="mt-2">Analytics and reporting dashboard</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entities" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-red-500" />
                  Data Entities
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-white">Core Entities</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">Project</h4>
                    <p className="text-sm">Main project record with client info, status, team assignments, images, and dates</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> name, client_name, vin, project_type_id, status_id, assigned_team, progress_percent, is_shareable
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">Task</h4>
                    <p className="text-sm">Project tasks with assignments, status tracking, and dependencies</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> name, project_id, category_id, assigned_team_member_id, status_id, is_priority, due_date, kanban_bucket_id
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">Part</h4>
                    <p className="text-sm">Parts inventory with vendor info, pricing, and location tracking</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> part_name, vendor_part_number, cost, retail, quantity_on_hand, vendor_id, location_id, status
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">PartBuildAssignment</h4>
                    <p className="text-sm">Links parts to projects with quantity needed and reserved tracking</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> part_id, project_id, needed_status, qty_needed, qty_reserved
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-white">Client Portal Entities</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">ClientContact</h4>
                    <p className="text-sm">Client contact information with portal access slug</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> name, email, phone, role_title, url_slug, active
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">ProjectClientAccess</h4>
                    <p className="text-sm">Controls client access to projects with tokens and slugs</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> project_id, client_contact_id, access_role, access_status, share_token, url_slug
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">ClientFeedbackRequest</h4>
                    <p className="text-sm">Feedback requests sent to clients</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> project_id, title, body, request_type (question, feedback_needed, design_review, client_need, todo_list), status (draft, posted, approved, changes_requested, archived), due_date
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">ToDoListTask</h4>
                    <p className="text-sm">Tasks within a todo_list type feedback request</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> request_id, title, is_complete, assigned_to_id, assigned_to_type (internal_user, client_contact), details, image_url, due_date
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">ClientFeedbackComment</h4>
                    <p className="text-sm">Comments on feedback requests from clients or internal users</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> request_id, author_type, author_id, body, visibility (client_visible, internal_only), target_type, target_attachment_id
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">ClientFeedbackDecision</h4>
                    <p className="text-sm">Approval/rejection decisions on requests or individual images</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> request_id, decided_by_type, decided_by_id, decision (approved, changes_requested, rejected), target_type (request, attachment_image), target_attachment_id, target_image_url
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                    <h4 className="font-semibold text-white">ClientFeedbackAttachment</h4>
                    <p className="text-sm">Images, files, and links attached to requests or comments</p>
                    <div className="text-xs text-gray-400">
                      <strong>Key Fields:</strong> request_id, comment_id, attachment_type (image, link, file), file_url, link_url, label, created_by_type
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-white">Configuration Entities</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">TeamMember</h4>
                      <p className="text-xs text-gray-400">Internal team with company filtering</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">ProjectType</h4>
                      <p className="text-xs text-gray-400">Hierarchical project categories</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">TaskCategory</h4>
                      <p className="text-xs text-gray-400">Hierarchical task categories</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">StatusList</h4>
                      <p className="text-xs text-gray-400">Statuses for projects and tasks</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">PartCategory</h4>
                      <p className="text-xs text-gray-400">Hierarchical part organization</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">Vendor</h4>
                      <p className="text-xs text-gray-400">Parts suppliers</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">Location</h4>
                      <p className="text-xs text-gray-400">Inventory storage locations</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">JournalEntry</h4>
                      <p className="text-xs text-gray-400">Project activity log</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="functions" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-red-500" />
                  Backend Functions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-white">Client Portal API Functions</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">publicClientPortalData</h4>
                    <p className="text-sm">Fetches all data for a client's project portal view</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ slug, projectId }"}</code><br/>
                      <strong>Returns:</strong> access, project, requests, comments, decisions, attachments<br/>
                      <strong>Auth:</strong> Public (slug-based access validation)
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">publicClientDecision</h4>
                    <p className="text-sm">Records client approval or change request decisions</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ slug, requestId, decision, note, targetAttachmentIds, newImages }"}</code><br/>
                      <strong>Returns:</strong> <code>{"{ success, decisions }"}</code><br/>
                      <strong>Auth:</strong> Public or Internal (supports both slug-based and authenticated)<br/>
                      <strong>Logic:</strong> Creates ClientFeedbackDecision records for either request-level or image-level decisions
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">publicClientRequestDetail</h4>
                    <p className="text-sm">Fetches detailed feedback request with enriched author/decider data</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ slug, requestId }"}</code><br/>
                      <strong>Returns:</strong> request with comments, decisions, attachments, todoTasks (for todo_list type), assignableUsers, assignableContacts<br/>
                      <strong>Auth:</strong> Public (slug-based access validation)
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">publicManageToDoTask</h4>
                    <p className="text-sm">CRUD operations for ToDo list tasks within a feedback request</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ slug, requestId, action: 'create'|'update'|'delete', task: {...} }"}</code><br/>
                      <strong>Returns:</strong> <code>{"{ success, result }"}</code><br/>
                      <strong>Auth:</strong> Public (slug-based access validation)<br/>
                      <strong>Actions:</strong> create (new task), update (toggle complete, edit details), delete (remove task)
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">publicAddClientComment</h4>
                    <p className="text-sm">Allows clients to add comments with attachments to feedback requests</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ slug, requestId, comment, attachments }"}</code><br/>
                      <strong>Returns:</strong> <code>{"{ success, comment, attachments }"}</code><br/>
                      <strong>Auth:</strong> Public (slug-based access validation)
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">publicClientProjects</h4>
                    <p className="text-sm">Lists all projects a client has access to</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ slug or token }"}</code><br/>
                      <strong>Returns:</strong> contact, accesses, projects, statuses, projectTypes<br/>
                      <strong>Auth:</strong> Public (slug or token-based)
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">getClientJournalEntries</h4>
                    <p className="text-sm">Fetches client-visible journal entries for a project</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ projectId, token?, slug? }"}</code><br/>
                      <strong>Returns:</strong> <code>{"{ success, entries: [{ id, headline, content, photos, entry_date, url, attachments, visibility }] }"}</code><br/>
                      <strong>Auth:</strong> Public (token or slug-based validation via ProjectClientAccess)<br/>
                      <strong>Filter:</strong> Only returns entries where <code>visibility === 'client'</code>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-white">Internal Functions</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">addInternalComment</h4>
                    <p className="text-sm">Adds authenticated internal user comments with attachments</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ requestId, body, visibility, photos, files, links }"}</code><br/>
                      <strong>Auth:</strong> Authenticated (uses base44.auth.me())
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">createFeedbackRequest</h4>
                    <p className="text-sm">Creates new client feedback request</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ project_id, title, body, request_type, due_date }"}</code><br/>
                      <strong>Auth:</strong> Authenticated
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">updateRequestStatus</h4>
                    <p className="text-sm">Updates feedback request status (draft, posted, archived)</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ requestId, status }"}</code><br/>
                      <strong>Auth:</strong> Authenticated
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">sendNeedsReviewEmail</h4>
                    <p className="text-sm">Sends email notification to client when request is posted</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ requestId }"}</code><br/>
                      <strong>Uses:</strong> RESEND_API_KEY secret
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-white">sendRequestStatusUpdateEmail</h4>
                    <p className="text-sm">Sends email notification when request status changes</p>
                    <div className="text-xs bg-gray-900 rounded p-2 mt-2">
                      <strong>Input:</strong> <code>{"{ requestId, oldStatus, newStatus }"}</code><br/>
                      <strong>Uses:</strong> RESEND_API_KEY secret
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="components" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Key Component Architecture</CardTitle>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-white">Client Portal Components</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <h4 className="font-semibold text-white text-sm">ClientFeedbackThread</h4>
                    <p className="text-xs text-gray-400">Displays threaded comments, decisions, and attachments with timeline view</p>
                    <p className="text-xs text-gray-500 mt-1">Location: <code>components/clientportal/ClientFeedbackThread</code></p>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <h4 className="font-semibold text-white text-sm">ToDoListDisplay</h4>
                    <p className="text-xs text-gray-400">Displays and manages ToDo list tasks grouped by assignee with CRUD operations</p>
                    <p className="text-xs text-gray-500 mt-1">Location: <code>components/clientportal/ToDoListDisplay</code></p>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <h4 className="font-semibold text-white text-sm">ClientPortalDashboard</h4>
                    <p className="text-xs text-gray-400">Main dashboard component for client portal with request management</p>
                    <p className="text-xs text-gray-500 mt-1">Location: <code>components/clientportal/ClientPortalDashboard</code></p>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <h4 className="font-semibold text-white text-sm">ManageClientAccessModal</h4>
                    <p className="text-xs text-gray-400">Modal for adding/managing client access to projects</p>
                    <p className="text-xs text-gray-500 mt-1">Location: <code>components/clientportal/ManageClientAccessModal</code></p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-white">Project Components</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">ProjectKanban</h4>
                      <p className="text-xs text-gray-400">Drag-and-drop Kanban board for tasks</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">ProjectOverview</h4>
                      <p className="text-xs text-gray-400">Project details and metadata display</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">ProjectJournal</h4>
                      <p className="text-xs text-gray-400">Activity timeline and journal entries</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">ProjectParts</h4>
                      <p className="text-xs text-gray-400">Parts assignments for project</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-700">
                  <h3 className="text-lg font-semibold text-white">Utility Components</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">ImageModal</h4>
                      <p className="text-xs text-gray-400">Full-screen image viewer modal</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">TaskDetailDrawer</h4>
                      <p className="text-xs text-gray-400">Slide-out drawer for editing tasks</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white text-sm">HierarchicalList</h4>
                      <p className="text-xs text-gray-400">Reusable tree/hierarchy component</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="systemmap" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Map className="w-5 h-5 text-red-500" />
                  System Map
                </CardTitle>
                <p className="text-sm text-gray-400">Complete inventory of all modules, pages, components, and data structures</p>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-6">
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-400">Development Rule</p>
                    <p className="text-sm text-gray-300 mt-1">When new pages or components are created, this System Map MUST be updated with stable IDs following Module_Page_Function naming convention.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Modules</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-2">Core Modules</h4>
                    <ul className="space-y-1 text-sm">
                      <li>• <strong>Project Management</strong> - Projects, Tasks, Kanban boards</li>
                      <li>• <strong>Parts Inventory</strong> - Parts tracking, locations, vendors</li>
                      <li>• <strong>Client Portal</strong> - Feedback requests, approvals, comments</li>
                      <li>• <strong>Team Management</strong> - Users, team members, access control</li>
                      <li>• <strong>Configuration</strong> - Admin settings, types, categories, statuses</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Pages with Stable IDs</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">PM_DASH_001</Badge>
                      <h4 className="font-semibold text-white text-sm">Dashboard</h4>
                      <p className="text-xs text-gray-400">Route: /Dashboard</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Project Management Module</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">PM_PRIO_001</Badge>
                      <h4 className="font-semibold text-white text-sm">PriorityDashboard</h4>
                      <p className="text-xs text-gray-400">Route: /PriorityDashboard</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Project Management Module</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">PM_PROJ_001</Badge>
                      <h4 className="font-semibold text-white text-sm">Projects</h4>
                      <p className="text-xs text-gray-400">Route: /Projects</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Project Management Module</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">PM_PROJD_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ProjectDetail</h4>
                      <p className="text-xs text-gray-400">Route: /ProjectDetail?id=</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Project Management Module</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-blue-600 mb-2">PM_MYPR_001</Badge>
                      <h4 className="font-semibold text-white text-sm">MyProjects</h4>
                      <p className="text-xs text-gray-400">Route: /MyProjects</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Project Management Module (Company Users)</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-blue-600 mb-2">PM_MYPRIOR_001</Badge>
                      <h4 className="font-semibold text-white text-sm">MyPriorities</h4>
                      <p className="text-xs text-gray-400">Route: /MyPriorities</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Project Management Module (Company Users)</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">TASK_EXP_001</Badge>
                      <h4 className="font-semibold text-white text-sm">TasksExplorer</h4>
                      <p className="text-xs text-gray-400">Route: /TasksExplorer</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Task Management</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">PARTS_TRACK_001</Badge>
                      <h4 className="font-semibold text-white text-sm">PartsTracker</h4>
                      <p className="text-xs text-gray-400">Route: /PartsTracker</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Parts Inventory Module</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-green-600 mb-2">CP_PROJ_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ClientProjects</h4>
                      <p className="text-xs text-gray-400">Route: /ClientProjects?slug=</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Client Portal Module (Public)</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-green-600 mb-2">CP_PORTAL_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ClientProjectPortal</h4>
                      <p className="text-xs text-gray-400">Route: /ClientProjectPortal?slug=&projectId=</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Client Portal Module (Public)</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-green-600 mb-2">CP_REQDET_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ClientFeedbackRequestDetail</h4>
                      <p className="text-xs text-gray-400">Route: /ClientFeedbackRequestDetail?slug=&requestId=</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Client Portal Module (Public)</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">CP_FEEDDET_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ClientFeedbackDetail</h4>
                      <p className="text-xs text-gray-400">Route: /ClientFeedbackDetail?id=&projectId=</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Client Portal Module (Internal)</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">ADMIN_CONF_001</Badge>
                      <h4 className="font-semibold text-white text-sm">AdminConfig</h4>
                      <p className="text-xs text-gray-400">Route: /AdminConfig</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Configuration Module</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">ADMIN_REP_001</Badge>
                      <h4 className="font-semibold text-white text-sm">Reports</h4>
                      <p className="text-xs text-gray-400">Route: /Reports</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Reporting Module</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-red-600 mb-2">ADMIN_SPEC_001</Badge>
                      <h4 className="font-semibold text-white text-sm">TechSpecs</h4>
                      <p className="text-xs text-gray-400">Route: /TechSpecs</p>
                      <p className="text-xs text-gray-500 mt-1">Owner: Documentation Module</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Shared Components with IDs</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_THREAD_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ClientFeedbackThread</h4>
                      <p className="text-xs text-gray-400">Threaded comments & decisions</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_KANBAN_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ProjectKanban</h4>
                      <p className="text-xs text-gray-400">Drag-drop task board</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_TASKDET_001</Badge>
                      <h4 className="font-semibold text-white text-sm">TaskDetailDrawer</h4>
                      <p className="text-xs text-gray-400">Task editing sidebar</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_IMGMOD_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ImageModal</h4>
                      <p className="text-xs text-gray-400">Full-screen image viewer</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_HIER_001</Badge>
                      <h4 className="font-semibold text-white text-sm">HierarchicalList</h4>
                      <p className="text-xs text-gray-400">Tree/hierarchy component</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_PROJCARD_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ProjectCard</h4>
                      <p className="text-xs text-gray-400">Project display card</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_TASKCARD_001</Badge>
                      <h4 className="font-semibold text-white text-sm">TaskCard</h4>
                      <p className="text-xs text-gray-400">Task display card</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_ACCESS_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ManageClientAccessModal</h4>
                      <p className="text-xs text-gray-400">Client access management</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <Badge className="bg-purple-600 mb-2 text-xs">COMP_TODO_001</Badge>
                      <h4 className="font-semibold text-white text-sm">ToDoListDisplay</h4>
                      <p className="text-xs text-gray-400">ToDo task list with assignees</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Data Entities Summary</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white">Core Entities (10)</h4>
                      <p className="text-xs text-gray-400 mt-1">Project, Task, Part, PartBuildAssignment, JournalEntry, Comment, TaskComment, ProjectKanbanBucket, TeamMember, ActivityLog</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white">Client Portal Entities (8)</h4>
                      <p className="text-xs text-gray-400 mt-1">ClientContact, ProjectClientAccess, ClientFeedbackRequest, ClientFeedbackComment, ClientFeedbackDecision, ClientFeedbackAttachment, ClientFeedbackTaskLink, ToDoListTask</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white">Configuration Entities (8)</h4>
                      <p className="text-xs text-gray-400 mt-1">ProjectType, TaskCategory, StatusList, PartCategory, Vendor, Location, CarMake, CarModel, CarYear</p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <h4 className="font-semibold text-white">System Entities (2)</h4>
                      <p className="text-xs text-gray-400 mt-1">User (built-in), Order</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Roles & Permission Levels</h3>
                  
                  <div className="space-y-3">
                    <div className="bg-gradient-to-r from-red-900/30 to-transparent border-l-4 border-red-600 p-4 rounded">
                      <h4 className="font-semibold text-white mb-2">Achtung Kraft Members</h4>
                      <ul className="text-sm space-y-1 text-gray-300">
                        <li>• Full access to all projects and tasks</li>
                        <li>• Can create, edit, delete any record</li>
                        <li>• Access to admin configuration</li>
                        <li>• Can manage client access</li>
                        <li>• Can view all reports and analytics</li>
                        <li>• Can view as other companies (testing)</li>
                      </ul>
                    </div>

                    <div className="bg-gradient-to-r from-blue-900/30 to-transparent border-l-4 border-blue-600 p-4 rounded">
                      <h4 className="font-semibold text-white mb-2">Company Users</h4>
                      <ul className="text-sm space-y-1 text-gray-300">
                        <li>• Access only to projects assigned to their company</li>
                        <li>• Can view and update tasks assigned to them</li>
                        <li>• Cannot access admin configuration</li>
                        <li>• Cannot manage client access</li>
                        <li>• Limited to MyProjects and MyPriorities pages</li>
                      </ul>
                    </div>

                    <div className="bg-gradient-to-r from-green-900/30 to-transparent border-l-4 border-green-600 p-4 rounded">
                      <h4 className="font-semibold text-white mb-2">Client Contacts</h4>
                      <ul className="text-sm space-y-1 text-gray-300">
                        <li>• Access via slug-based public URLs (no login)</li>
                        <li>• View feedback requests on assigned projects only</li>
                        <li>• Can comment and add attachments</li>
                        <li>• Can approve or request changes (if approver role)</li>
                        <li>• Cannot see internal-only comments</li>
                        <li>• No access to project management features</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagecontracts" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-red-500" />
                  Page Contracts
                </CardTitle>
                <p className="text-sm text-gray-400">Detailed contracts for each app page defining behavior, data, and constraints</p>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-6">
                <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4">
                  <h3 className="font-semibold text-amber-400 mb-2">Page Contract Index</h3>
                  <p className="text-sm text-gray-300">Click any page below to view its detailed contract:</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <a href="#contract-dashboard" className="bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 transition-colors border border-gray-700">
                    <Badge className="bg-red-600 mb-2">PM_DASH_001</Badge>
                    <h4 className="font-semibold text-white">Dashboard Contract</h4>
                    <p className="text-xs text-gray-400 mt-1">Main project overview page</p>
                  </a>

                  <a href="#contract-priorities" className="bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 transition-colors border border-gray-700">
                    <Badge className="bg-red-600 mb-2">PM_PRIO_001</Badge>
                    <h4 className="font-semibold text-white">Priority Dashboard Contract</h4>
                    <p className="text-xs text-gray-400 mt-1">High-priority tasks view</p>
                  </a>

                  <a href="#contract-clientportal" className="bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 transition-colors border border-gray-700">
                    <Badge className="bg-green-600 mb-2">CP_PORTAL_001</Badge>
                    <h4 className="font-semibold text-white">Client Portal Contract</h4>
                    <p className="text-xs text-gray-400 mt-1">Public client feedback view</p>
                  </a>

                  <a href="#contract-template" className="bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 transition-colors border border-gray-700">
                    <Badge className="bg-purple-600 mb-2">TEMPLATE</Badge>
                    <h4 className="font-semibold text-white">Page Contract Template</h4>
                    <p className="text-xs text-gray-400 mt-1">Use this template for new pages</p>
                  </a>
                </div>

                <div id="contract-template" className="bg-gray-900/50 rounded-lg p-6 border-2 border-purple-700 space-y-4">
                  <h3 className="text-xl font-semibold text-purple-400">Page Contract Template</h3>
                  <p className="text-sm text-gray-400">Use this template when creating contracts for new pages</p>

                  <div className="space-y-4 text-sm">
                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Page Identification</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• <strong>Page ID:</strong> [MODULE_PAGE_001]</li>
                        <li>• <strong>Route:</strong> /PageName?params</li>
                        <li>• <strong>Owner:</strong> [Module Name]</li>
                        <li>• <strong>Last Updated:</strong> [Date]</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Primary Goal</h4>
                      <p className="text-gray-300">[One sentence describing what this page accomplishes for the user]</p>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">UI Regions + Component IDs</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• <strong>Header:</strong> [COMP_XXX_001] - [Description]</li>
                        <li>• <strong>Main Content:</strong> [COMP_YYY_001] - [Description]</li>
                        <li>• <strong>Sidebar:</strong> [COMP_ZZZ_001] - [Description]</li>
                        <li>• <strong>Footer/Actions:</strong> [COMP_AAA_001] - [Description]</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Data Dependencies</h4>
                      <ul className="space-y-2 text-gray-300">
                        <li>
                          <strong>Query 1:</strong> [Entity.list/filter]
                          <ul className="ml-4 mt-1 text-xs text-gray-400">
                            <li>- Filters: [field: value]</li>
                            <li>- Sorting: [field, direction]</li>
                            <li>- Pagination: [limit, offset]</li>
                          </ul>
                        </li>
                        <li>
                          <strong>Query 2:</strong> [Entity.list/filter]
                          <ul className="ml-4 mt-1 text-xs text-gray-400">
                            <li>- Filters: [field: value]</li>
                          </ul>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">States</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• <strong>Loading:</strong> Show spinner, disable interactions</li>
                        <li>• <strong>Empty:</strong> "No [items] found" message with create button</li>
                        <li>• <strong>Error:</strong> Display error message, show retry button</li>
                        <li>• <strong>Permission Denied:</strong> Redirect to [page] or show access message</li>
                        <li>• <strong>Success:</strong> Display data in [layout]</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Actions/Events</h4>
                      <ul className="space-y-2 text-gray-300">
                        <li>
                          <strong>Action 1:</strong> [Button/Event Name]
                          <ul className="ml-4 mt-1 text-xs text-gray-400">
                            <li>- Triggers: [mutation/function]</li>
                            <li>- Invalidates: [query keys]</li>
                            <li>- Success: [toast/navigation]</li>
                            <li>- Error: [error handling]</li>
                          </ul>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3 border-2 border-red-600">
                      <h4 className="font-semibold text-red-400 mb-2">Guardrails (Must Not Change)</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• [Critical behavior that must remain unchanged]</li>
                        <li>• [Data integrity rule]</li>
                        <li>• [Access control requirement]</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Mobile Layout Requirements</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• Responsive breakpoint: [768px / 1024px]</li>
                        <li>• Mobile navigation: [bottom nav / sidebar]</li>
                        <li>• Touch targets: minimum 44px</li>
                        <li>• Simplified UI: [what changes on mobile]</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div id="contract-dashboard" className="bg-gray-900/50 rounded-lg p-6 border border-gray-700 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge className="bg-red-600 mb-2">PM_DASH_001</Badge>
                      <h3 className="text-xl font-semibold text-white">Dashboard Page Contract</h3>
                    </div>
                    <Badge className="bg-green-600">Active</Badge>
                  </div>

                  <div className="space-y-4 text-sm">
                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Page Identification</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• <strong>Route:</strong> /Dashboard</li>
                        <li>• <strong>Owner:</strong> Project Management Module</li>
                        <li>• <strong>Access:</strong> Achtung Kraft Members only</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Primary Goal</h4>
                      <p className="text-gray-300">Provide Achtung Kraft members with a comprehensive overview of all active projects with filtering, grouping, and quick access to project details.</p>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">UI Regions</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• <strong>Header:</strong> Page title, refresh button, "New Project" button</li>
                        <li>• <strong>Filters:</strong> Search bar, Group By selector, Status/Type filters</li>
                        <li>• <strong>Main Content:</strong> COMP_PROJCARD_001 grid grouped by selected criteria</li>
                        <li>• <strong>Modals:</strong> CreateProjectModal, EditProjectModal</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Data Dependencies</h4>
                      <ul className="space-y-2 text-gray-300">
                        <li><strong>Project.list():</strong> All projects, no filters, sorted by created_date descending</li>
                        <li><strong>StatusList.filter({"{"}scope: 'Project'{"}"}):</strong> Available project statuses</li>
                        <li><strong>ProjectType.list():</strong> Project type categories for filtering/grouping</li>
                        <li><strong>TeamMember.list():</strong> For team assignments display</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3 border-2 border-red-600">
                      <h4 className="font-semibold text-red-400 mb-2">Guardrails</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• MUST NOT allow company users to access this page (redirect to MyProjects)</li>
                        <li>• MUST invalidate queries after project create/update</li>
                        <li>• Project cards MUST show featured_image_url or default placeholder</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-500" />
                  Rules Catalog
                </CardTitle>
                <p className="text-sm text-gray-400">Centralized repository of all business rules, state machines, and validation logic</p>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-6">
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-400">Development Rule</p>
                    <p className="text-sm text-gray-300 mt-1">Page logic MUST reference Rules Catalog entries rather than redefining rules ad-hoc. All new validation or state logic must be documented here first.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Status & State Machines</h3>

                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-3">Project Status State Machine</h4>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-400">Allowed transitions:</p>
                      <div className="bg-gray-900 rounded p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-gray-600">New</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-blue-600">In Progress</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-600">In Progress</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-yellow-600">On Hold</Badge>
                          <span className="text-gray-500">|</span>
                          <Badge className="bg-green-600">Completed</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-yellow-600">On Hold</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-blue-600">In Progress</Badge>
                          <span className="text-gray-500">|</span>
                          <Badge className="bg-red-600">Cancelled</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-600">Completed</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-purple-600">Archived</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>STATE_PROJECT_001</code></p>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-3">Task Status State Machine</h4>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-400">Allowed transitions:</p>
                      <div className="bg-gray-900 rounded p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-gray-600">To Do</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-blue-600">In Progress</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-600">In Progress</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-yellow-600">Blocked</Badge>
                          <span className="text-gray-500">|</span>
                          <Badge className="bg-green-600">Completed</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-yellow-600">Blocked</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-blue-600">In Progress</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-600">Completed</Badge>
                          <span className="text-gray-500">→</span>
                          <span className="text-gray-400">(final state, set completed_date)</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>STATE_TASK_001</code></p>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-3">Feedback Request Status State Machine</h4>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-400">Allowed transitions:</p>
                      <div className="bg-gray-900 rounded p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-gray-600">Draft</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-blue-600">Posted</Badge>
                          <span className="text-gray-400 text-xs ml-2">(sets posted_at, sends email)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-600">Posted</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-orange-600">Changes Requested</Badge>
                          <span className="text-gray-500">|</span>
                          <Badge className="bg-purple-600">Archived</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-orange-600">Changes Requested</Badge>
                          <span className="text-gray-500">→</span>
                          <Badge className="bg-blue-600">Posted</Badge>
                          <span className="text-gray-500">|</span>
                          <Badge className="bg-purple-600">Archived</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>STATE_FEEDBACK_001</code></p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Validation Rules</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Project Validation</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <strong>name:</strong> Required, max 200 chars</li>
                        <li>• <strong>vin:</strong> Optional, must be alphanumeric</li>
                        <li>• <strong>assigned_team:</strong> Must be array of valid TeamMember IDs</li>
                        <li>• <strong>progress_percent:</strong> 0-100, auto-calculated from tasks</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>VALID_PROJECT_001</code></p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Task Validation</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <strong>name:</strong> Required, max 200 chars</li>
                        <li>• <strong>project_id:</strong> Required, must reference existing Project</li>
                        <li>• <strong>due_date:</strong> Cannot be in the past</li>
                        <li>• <strong>dependencies:</strong> Cannot create circular dependencies</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>VALID_TASK_001</code></p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Client Contact Validation</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <strong>email:</strong> Required, valid email format, unique</li>
                        <li>• <strong>url_slug:</strong> Required, unique, lowercase, alphanumeric + hyphens</li>
                        <li>• <strong>name:</strong> Required, max 100 chars</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>VALID_CLIENT_001</code></p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Part Validation</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <strong>part_name:</strong> Required, max 200 chars</li>
                        <li>• <strong>quantity_on_hand:</strong> Cannot be negative</li>
                        <li>• <strong>cost, retail:</strong> Must be non-negative numbers</li>
                        <li>• <strong>status:</strong> Must be "On-Hand", "Need to Buy", or "On-Order"</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>VALID_PART_001</code></p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Permission Rules</h3>

                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-3">Role → Capabilities Matrix</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-900">
                          <tr>
                            <th className="p-2 text-left text-gray-400">Page/Feature</th>
                            <th className="p-2 text-center text-red-400">Achtung Kraft</th>
                            <th className="p-2 text-center text-blue-400">Company User</th>
                            <th className="p-2 text-center text-green-400">Client Contact</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-300">
                          <tr className="border-t border-gray-700">
                            <td className="p-2">Dashboard</td>
                            <td className="p-2 text-center">✓ Full</td>
                            <td className="p-2 text-center">✗ Redirect</td>
                            <td className="p-2 text-center">✗ No Access</td>
                          </tr>
                          <tr className="border-t border-gray-700">
                            <td className="p-2">MyProjects</td>
                            <td className="p-2 text-center">✓ All Projects</td>
                            <td className="p-2 text-center">✓ Company Only</td>
                            <td className="p-2 text-center">✗ No Access</td>
                          </tr>
                          <tr className="border-t border-gray-700">
                            <td className="p-2">AdminConfig</td>
                            <td className="p-2 text-center">✓ Full</td>
                            <td className="p-2 text-center">✗ Redirect</td>
                            <td className="p-2 text-center">✗ No Access</td>
                          </tr>
                          <tr className="border-t border-gray-700">
                            <td className="p-2">Client Portal (Public)</td>
                            <td className="p-2 text-center">✓ Via URL</td>
                            <td className="p-2 text-center">✓ Via URL</td>
                            <td className="p-2 text-center">✓ Slug-based</td>
                          </tr>
                          <tr className="border-t border-gray-700">
                            <td className="p-2">Create/Edit Projects</td>
                            <td className="p-2 text-center">✓ All</td>
                            <td className="p-2 text-center">✗ Read Only</td>
                            <td className="p-2 text-center">✗ No Access</td>
                          </tr>
                          <tr className="border-t border-gray-700">
                            <td className="p-2">Approve Feedback</td>
                            <td className="p-2 text-center">✓ Always</td>
                            <td className="p-2 text-center">✗ Never</td>
                            <td className="p-2 text-center">✓ If Approver Role</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Rule ID: <code>PERM_ROLES_001</code></p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Notification Rules</h3>

                  <div className="space-y-3">
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Client Feedback Posted</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <strong>Trigger:</strong> Feedback request status changes from "draft" to "posted"</li>
                        <li>• <strong>Recipient:</strong> All client contacts with access to the project</li>
                        <li>• <strong>Function:</strong> sendNeedsReviewEmail</li>
                        <li>• <strong>Content:</strong> Request title, type, due date, portal link</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>NOTIF_FEEDBACK_001</code></p>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Client Decision Made</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <strong>Trigger:</strong> Client submits approval or change request</li>
                        <li>• <strong>Recipient:</strong> Internal team members assigned to project</li>
                        <li>• <strong>Function:</strong> sendRequestStatusUpdateEmail</li>
                        <li>• <strong>Content:</strong> Decision type, client name, request link</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">Rule ID: <code>NOTIF_DECISION_001</code></p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Naming Conventions</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Status Labels</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• Use Title Case (e.g., "In Progress", "On Hold")</li>
                        <li>• Keep under 20 characters</li>
                        <li>• Avoid abbreviations</li>
                        <li>• Use action-oriented language</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Request Types</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <code>approval</code> - Needs client confirmation</li>
                        <li>• <code>question</code> - Awaiting client answer</li>
                        <li>• <code>review</code> - General review request</li>
                        <li>• <code>update</code> - Informational update</li>
                        <li>• <code>image_review</code> - Visual design review</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Decision Types</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• <code>approved</code> - Client accepts</li>
                        <li>• <code>changes_requested</code> - Client wants changes</li>
                        <li>• <code>rejected</code> - Client declines (rare)</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <h4 className="font-semibold text-white text-sm mb-2">Entity Field Names</h4>
                      <ul className="text-xs text-gray-300 space-y-1">
                        <li>• Use snake_case for all fields</li>
                        <li>• Foreign keys end with _id</li>
                        <li>• Boolean fields start with is_ or has_</li>
                        <li>• Dates end with _date or _at</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="changes" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-red-500" />
                  Change Management
                </CardTitle>
                <p className="text-sm text-gray-400">Change request specifications and development workflow</p>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-6">
                <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-blue-400">Development Workflow Rule</p>
                    <p className="text-sm text-gray-300 mt-1">Any requested change MUST reference Page IDs + Component IDs and include acceptance criteria and test steps before implementation.</p>
                  </div>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-6 border-2 border-purple-700 space-y-4">
                  <h3 className="text-xl font-semibold text-purple-400">Change Request Spec Template</h3>
                  <p className="text-sm text-gray-400">Use this template for all change requests</p>

                  <div className="space-y-4 text-sm">
                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Change Identification</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• <strong>Change ID:</strong> CHG-[YYYY-MM-DD]-[XXX]</li>
                        <li>• <strong>Date:</strong> [YYYY-MM-DD]</li>
                        <li>• <strong>Requester:</strong> [Name/Role]</li>
                        <li>• <strong>Priority:</strong> [Critical / High / Medium / Low]</li>
                        <li>• <strong>Status:</strong> [Requested / Approved / In Progress / Completed / Rejected]</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Affected Components</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>• <strong>Page ID(s):</strong> [PM_DASH_001, CP_PORTAL_001, etc.]</li>
                        <li>• <strong>Component ID(s):</strong> [COMP_THREAD_001, etc.]</li>
                        <li>• <strong>Backend Functions:</strong> [publicClientDecision, etc.]</li>
                        <li>• <strong>Data Entities:</strong> [ClientFeedbackDecision, etc.]</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Behavior Description</h4>
                      <div className="space-y-2 text-gray-300">
                        <div>
                          <strong>Current Behavior:</strong>
                          <p className="ml-4 text-xs text-gray-400">[Describe exactly what happens now, step by step]</p>
                        </div>
                        <div>
                          <strong>Desired Behavior:</strong>
                          <p className="ml-4 text-xs text-gray-400">[Describe exactly what should happen, step by step]</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Acceptance Criteria Checklist</h4>
                      <ul className="space-y-1 text-gray-300">
                        <li>□ [Specific testable criterion 1]</li>
                        <li>□ [Specific testable criterion 2]</li>
                        <li>□ [Specific testable criterion 3]</li>
                        <li>□ No regression in related features</li>
                        <li>□ Works on mobile and desktop</li>
                        <li>□ Handles error states gracefully</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Change Details</h4>
                      <div className="space-y-2 text-gray-300">
                        <div>
                          <strong>UI Changes (Explicit List):</strong>
                          <ul className="ml-4 text-xs text-gray-400 space-y-1 mt-1">
                            <li>• [Specific UI element to add/modify/remove]</li>
                            <li>• [Button text/color/position changes]</li>
                            <li>• [New form fields or validation messages]</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Logic Changes (Explicit List):</strong>
                          <ul className="ml-4 text-xs text-gray-400 space-y-1 mt-1">
                            <li>• [Business logic modification]</li>
                            <li>• [State management changes]</li>
                            <li>• [API call modifications]</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Data Model Changes (Explicit List):</strong>
                          <ul className="ml-4 text-xs text-gray-400 space-y-1 mt-1">
                            <li>• [New entity fields]</li>
                            <li>• [Modified entity relationships]</li>
                            <li>• [Data migration required?]</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Edge Cases</h4>
                      <ul className="space-y-1 text-gray-300 text-xs">
                        <li>• What happens if [user action] occurs during [process]?</li>
                        <li>• How to handle missing/invalid data?</li>
                        <li>• What if user lacks permission?</li>
                        <li>• Concurrent user scenarios?</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Test Plan Checklist</h4>
                      <ul className="space-y-1 text-gray-300 text-xs">
                        <li>□ Test as Achtung Kraft member</li>
                        <li>□ Test as company user</li>
                        <li>□ Test as client contact</li>
                        <li>□ Test on mobile viewport</li>
                        <li>□ Test with empty/missing data</li>
                        <li>□ Test concurrent operations</li>
                        <li>□ Verify query invalidation works</li>
                        <li>□ Check console for errors</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded p-3">
                      <h4 className="font-semibold text-white mb-2">Related Rules</h4>
                      <p className="text-xs text-gray-400">Reference Rule IDs from Rules Catalog:</p>
                      <ul className="space-y-1 text-gray-300 text-xs ml-4 mt-1">
                        <li>• [STATE_XXX_001] - [Brief description]</li>
                        <li>• [VALID_YYY_001] - [Brief description]</li>
                        <li>• [PERM_ZZZ_001] - [Brief description]</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Change Log Index</h3>
                  <p className="text-sm text-gray-400">Recent change requests:</p>

                  <div className="space-y-3">
                    <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-green-600">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <Badge className="bg-green-600 mb-1">CHG-2025-12-23-001</Badge>
                          <h4 className="font-semibold text-white text-sm">Fix: New images in change requests not displaying in timeline</h4>
                        </div>
                        <Badge className="bg-green-600">Completed</Badge>
                      </div>
                      <ul className="text-xs text-gray-400 space-y-1">
                        <li>• <strong>Affected:</strong> CP_FEEDDET_001 (ClientFeedbackDetail), COMP_THREAD_001 (ClientFeedbackThread), publicClientDecision function</li>
                        <li>• <strong>Root Cause:</strong> (1) Incorrect timeline filtering - earliestDecisionTime check prevented new reference images from displaying; (2) Query invalidation for attachments not properly centralized; (3) reviewNewImages state not passed from quick-approve button</li>
                        <li>• <strong>Changes:</strong> 
                          <ul className="ml-4 mt-1 space-y-1">
                            <li>- Removed earliestDecisionTime filter from referenceAttachments matching in COMP_THREAD_001</li>
                            <li>- Reference attachments now match ONLY by creator + 5s time proximity</li>
                            <li>- Centralized decision submission in CP_FEEDDET_001 via submitDecisionMutation using publicClientDecision</li>
                            <li>- COMP_THREAD_001 accepts onDecisionSubmit prop for internal view, falls back to direct publicClientDecision for client portal</li>
                            <li>- submitDecisionMutation now properly invalidates clientFeedbackAttachments query</li>
                            <li>- Added reviewNewImages state and image upload UI to CP_FEEDDET_001 request decision modal</li>
                            <li>- Fixed quick-approve button in CP_FEEDDET_001 to pass reviewNewImages instead of empty array</li>
                            <li>- For image_review types, COMP_THREAD_001 floating action bar correctly passes newImages (already working)</li>
                          </ul>
                        </li>
                        <li>• <strong>Date:</strong> 2025-12-23</li>
                        <li>• <strong>Client Portal Sync:</strong> Apply same timeline filter fix (remove earliestDecisionTime check). Ensure all decision buttons pass newImages array correctly.</li>
                      </ul>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-green-600">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <Badge className="bg-green-600 mb-1">CHG-2025-12-23-002</Badge>
                          <h4 className="font-semibold text-white text-sm">Feature: Add comprehensive documentation system</h4>
                        </div>
                        <Badge className="bg-green-600">Completed</Badge>
                      </div>
                      <ul className="text-xs text-gray-400 space-y-1">
                        <li>• <strong>Affected:</strong> ADMIN_SPEC_001 (TechSpecs page)</li>
                        <li>• <strong>Change:</strong> Add System Map, Page Contracts, Rules Catalog, Change Management, Client Portal Logic, API Sync tabs</li>
                        <li>• <strong>Date:</strong> 2025-12-23</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-3">Development Workflow</h3>
                  <ol className="space-y-3 text-sm text-gray-300">
                    <li className="flex gap-3">
                      <span className="font-bold text-red-500">1.</span>
                      <div>
                        <strong>Create Change Request Spec</strong>
                        <p className="text-xs text-gray-400 mt-1">Fill out template with all required fields, Page/Component IDs, acceptance criteria, and test plan</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-red-500">2.</span>
                      <div>
                        <strong>Review Rules Catalog</strong>
                        <p className="text-xs text-gray-400 mt-1">Ensure change aligns with existing state machines, validation rules, and permissions</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-red-500">3.</span>
                      <div>
                        <strong>Check Page Contracts</strong>
                        <p className="text-xs text-gray-400 mt-1">Review guardrails and data dependencies for affected pages</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-red-500">4.</span>
                      <div>
                        <strong>Implement Changes</strong>
                        <p className="text-xs text-gray-400 mt-1">Make minimal, focused changes that match the spec exactly</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-red-500">5.</span>
                      <div>
                        <strong>Execute Test Plan</strong>
                        <p className="text-xs text-gray-400 mt-1">Complete all checklist items from the change request spec</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-red-500">6.</span>
                      <div>
                        <strong>Update Documentation</strong>
                        <p className="text-xs text-gray-400 mt-1">Update System Map if new pages/components added, update affected Page Contracts, add to Change Log</p>
                      </div>
                    </li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clientportal" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-red-500" />
                  Client Portal Business Logic
                </CardTitle>
                <p className="text-sm text-gray-400">Comprehensive documentation of client feedback system behavior</p>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-6">
                
                <div className="space-y-4">
                  <h3 className="text-2xl font-semibold text-white border-b border-gray-700 pb-2">ClientFeedbackDetail Page Logic</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-red-600">CP_FEEDDET_001</Badge>
                      <Badge className="bg-purple-600">Internal Only</Badge>
                    </div>
                    <h4 className="font-semibold text-white text-lg">Overview</h4>
                    <p className="text-sm">Internal authenticated page for managing client feedback requests. Allows team members to view, edit, post, archive requests and interact with client responses.</p>
                  </div>

                  <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white text-lg">Data Flow & Dependencies</h4>
                    
                    <div className="space-y-3">
                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Initial Data Load</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <code>ClientFeedbackRequest.filter({"{"} id: requestId {"}"})</code> - Main request data</li>
                          <li>• <code>ClientFeedbackComment.filter({"{"} request_id: requestId {"}"})</code> - All comments (sorted by created_date desc)</li>
                          <li>• <code>ClientFeedbackDecision.filter({"{"} request_id: requestId {"}"})</code> - All decisions</li>
                          <li>• <code>ClientFeedbackAttachment.filter({"{"} request_id: requestId {"}"})</code> - All attachments</li>
                          <li>• <code>User.list()</code> - For author enrichment</li>
                          <li>• <code>ClientContact.list()</code> - For author enrichment</li>
                          <li>• <code>Project.filter({"{"} id: request.project_id {"}"})</code> - Project context</li>
                          <li>• <code>ClientFeedbackTaskLink.filter({"{"} request_id: requestId {"}"})</code> - Linked tasks</li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Query Invalidation Strategy</h5>
                        <p className="text-xs text-gray-400 mb-2">After mutations (especially submitDecisionMutation), invalidate:</p>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <code>['clientFeedbackRequest', requestId]</code></li>
                          <li>• <code>['clientFeedbackComments', requestId]</code></li>
                          <li>• <code>['clientFeedbackDecisions', requestId]</code></li>
                          <li>• <code>['clientFeedbackAttachments', requestId]</code> - CRITICAL for showing new images</li>
                          <li>• <code>['clientFeedbackTaskLinks', requestId]</code></li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Data Enrichment Before Display</h5>
                        <p className="text-xs text-gray-400 mb-2">CRITICAL: Before passing to COMP_THREAD_001, enrich:</p>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <code>request.creator</code> - User who created request</li>
                          <li>• <code>comment.author</code> - User/ClientContact for each comment</li>
                          <li>• <code>decision.decider</code> - User/ClientContact for each decision</li>
                          <li>• <code>attachment.creator</code> - User/ClientContact for each attachment</li>
                        </ul>
                        <p className="text-xs text-red-400 mt-2">⚠️ Missing enrichment prevents timeline reference attachment matching by creator!</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white text-lg">State Management</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">UI States</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <code>selectedImage</code> - Currently viewing image (ImageModal)</li>
                          <li>• <code>selectedImageIds</code> - Images selected for review</li>
                          <li>• <code>showRequestDecisionForm</code> - Decision modal visibility</li>
                          <li>• <code>requestDecisionType</code> - approved | changes_requested</li>
                          <li>• <code>decisionUploadedImages</code> - New reference images</li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Comment Form States</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <code>newComment</code> - Comment text</li>
                          <li>• <code>uploadedPhotos</code> - Uploaded image URLs</li>
                          <li>• <code>uploadedFiles</code> - Uploaded file objects</li>
                          <li>• <code>newLinks</code> - Array of link strings</li>
                          <li>• <code>uploadingImages</code> - Upload in progress</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white text-lg">Business Logic Rules</h4>
                    
                    <div className="space-y-3">
                      <div className="bg-gray-800/50 rounded p-3 border-l-4 border-blue-600">
                        <h5 className="font-semibold text-blue-400 text-sm mb-2">Request Status Transitions</h5>
                        <ul className="text-xs space-y-2 text-gray-300">
                          <li>
                            <strong>Draft → Posted:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Sets <code>posted_at</code> to current timestamp</li>
                              <li>- Triggers <code>sendNeedsReviewEmail</code> function</li>
                              <li>- Email sent to all clients with access to project</li>
                              <li>- Request becomes visible in client portal</li>
                            </ul>
                          </li>
                          <li>
                            <strong>Posted → Archived:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Request hidden from active client portal view</li>
                              <li>- No email notification</li>
                              <li>- Still accessible via direct link</li>
                            </ul>
                          </li>
                          <li>
                            <strong>Auto: Changes Requested:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Set automatically when client submits changes_requested decision</li>
                              <li>- Handled by <code>publicClientDecision</code> function</li>
                            </ul>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3 border-l-4 border-green-600">
                        <h5 className="font-semibold text-green-400 text-sm mb-2">Comment Visibility Logic</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <strong>client_visible:</strong> Shows in both internal and client portal views</li>
                          <li>• <strong>internal_only:</strong> Shows only in internal view (this page)</li>
                          <li>• Default is <code>client_visible</code></li>
                          <li>• Internal users can toggle visibility when adding comments</li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3 border-l-4 border-purple-600">
                        <h5 className="font-semibold text-purple-400 text-sm mb-2">Attachment Handling</h5>
                        <ul className="text-xs space-y-2 text-gray-300">
                          <li>
                            <strong>Image Attachments:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Uploaded via <code>Core.UploadFile</code> integration</li>
                              <li>- Stored with <code>attachment_type: 'image'</code></li>
                              <li>- Can be attached to request or comment</li>
                              <li>- Can be targeted for individual decisions</li>
                            </ul>
                          </li>
                          <li>
                            <strong>File Attachments:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Supports PDF, DOC, DOCX, XLS, XLSX, ZIP</li>
                              <li>- Stored with <code>attachment_type: 'file'</code></li>
                              <li>- <code>label</code> field stores filename</li>
                            </ul>
                          </li>
                          <li>
                            <strong>Link Attachments:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- External URLs stored in <code>link_url</code></li>
                              <li>- <code>attachment_type: 'link'</code></li>
                              <li>- Opens in new tab</li>
                            </ul>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3 border-l-4 border-orange-600">
                        <h5 className="font-semibold text-orange-400 text-sm mb-2">Decision Recording</h5>
                        <ul className="text-xs space-y-2 text-gray-300">
                          <li>
                            <strong>Request-Level Decisions:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Applied to entire request</li>
                              <li>- <code>target_type: 'request'</code></li>
                              <li>- Can include note and reference images</li>
                            </ul>
                          </li>
                          <li>
                            <strong>Image-Level Decisions:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Applied to specific images</li>
                              <li>- <code>target_type: 'attachment_image'</code></li>
                              <li>- Stores <code>target_attachment_id</code> and <code>target_image_url</code></li>
                              <li>- Multiple images can be decided in one action</li>
                            </ul>
                          </li>
                          <li>
                            <strong>Reference Images:</strong>
                            <ul className="ml-4 mt-1 space-y-1 text-gray-400">
                              <li>- Images uploaded alongside decision</li>
                              <li>- Created as attachments with matching <code>posted_at</code></li>
                              <li>- Not linked to comment_id</li>
                              <li>- Matched by creator + timestamp (5 second window)</li>
                            </ul>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white text-lg">Timeline/Thread Logic</h4>
                    
                    <div className="bg-gray-800/50 rounded p-3">
                      <h5 className="font-semibold text-white text-sm mb-2">COMP_THREAD_001 Behavior</h5>
                      <p className="text-xs text-gray-400 mb-3">The ClientFeedbackThread component builds a chronological timeline:</p>
                      
                      <div className="space-y-3">
                        <div className="bg-gray-900 rounded p-3">
                          <h6 className="font-semibold text-white text-xs mb-2">1. Initial Post</h6>
                          <ul className="text-xs space-y-1 text-gray-300">
                            <li>• Shows request creator, title, body, posted_at</li>
                            <li>• Includes attachments created BEFORE earliest decision</li>
                            <li>• Filter: <code>attachmentTime {'<'} earliestDecisionTime</code></li>
                          </ul>
                        </div>

                        <div className="bg-gray-900 rounded p-3">
                          <h6 className="font-semibold text-white text-xs mb-2">2. Comments</h6>
                          <ul className="text-xs space-y-1 text-gray-300">
                            <li>• Shows author, body, timestamp</li>
                            <li>• Includes attachments where <code>comment_id</code> matches</li>
                            <li>• Filters out comments that match decision (same author + timestamp ± 2s)</li>
                            <li>• Prevents duplicate posts when comment+decision happen together</li>
                          </ul>
                        </div>

                        <div className="bg-gray-900 rounded p-3">
                          <h6 className="font-semibold text-white text-xs mb-2">3. Decision Posts</h6>
                          <ul className="text-xs space-y-1 text-gray-300">
                            <li>• Groups decisions by decider + timestamp (1 second window)</li>
                            <li>• Shows decision type (approved/changes_requested)</li>
                            <li>• Displays note if provided</li>
                            <li>• Shows "Reviewed Images" section for image-level decisions</li>
                            <li>• Shows "Reference Images" section for uploaded images</li>
                          </ul>
                        </div>

                        <div className="bg-gray-900 rounded p-3">
                          <h6 className="font-semibold text-white text-xs mb-2">Reference Image Matching Algorithm</h6>
                          <p className="text-xs text-gray-400 mb-2">Attachments shown as "Reference Images" if:</p>
                          <ul className="text-xs space-y-1 text-gray-300">
                            <li>• <code>!a.comment_id</code> - Not linked to comment</li>
                            <li>• <code>a.created_by_type === decision.decided_by_type</code></li>
                            <li>• <code>a.created_by_id === decision.decided_by_id</code></li>
                            <li>• <code>Math.abs(attachmentTime - decisionTime) {'<'} 5000</code> - Within 5 seconds</li>
                            <li className="line-through text-red-400">• <code>attachmentTime {'>='} earliestDecisionTime</code> - REMOVED (was incorrectly filtering new images)</li>
                          </ul>
                        </div>

                        <div className="bg-gray-900 rounded p-3">
                          <h6 className="font-semibold text-white text-xs mb-2">Sorting</h6>
                          <ul className="text-xs space-y-1 text-gray-300">
                            <li>• All timeline events sorted by timestamp DESC</li>
                            <li>• Most recent at top</li>
                            <li>• Initial post always last (oldest)</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white text-lg">Action Buttons & Permissions</h4>
                    
                    <div className="space-y-3">
                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Post to Client</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <strong>Visibility:</strong> Only when status = 'draft'</li>
                          <li>• <strong>Action:</strong> Updates status to 'posted', sets posted_at</li>
                          <li>• <strong>Backend:</strong> <code>updateRequestStatus</code> function</li>
                          <li>• <strong>Side Effect:</strong> Triggers <code>sendNeedsReviewEmail</code></li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Archive Request</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <strong>Visibility:</strong> Any status</li>
                          <li>• <strong>Action:</strong> Updates status to 'archived'</li>
                          <li>• <strong>Result:</strong> Hidden from active client portal view</li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Delete Request</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <strong>Visibility:</strong> Any status</li>
                          <li>• <strong>Confirmation:</strong> Required</li>
                          <li>• <strong>Action:</strong> Hard delete of request record</li>
                          <li>• <strong>Side Effect:</strong> Cascading delete of comments, decisions, attachments</li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Create Task from Approval</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <strong>Visibility:</strong> When any approved decision exists</li>
                          <li>• <strong>Modal:</strong> CreateTaskFromApprovalModal</li>
                          <li>• <strong>Pre-fills:</strong> Task name from request title, description from decision note</li>
                          <li>• <strong>Creates:</strong> Task + ClientFeedbackTaskLink</li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Add Comment (Internal)</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <strong>Visibility Toggle:</strong> client_visible | internal_only</li>
                          <li>• <strong>Attachments:</strong> Supports images, files, links</li>
                          <li>• <strong>Backend:</strong> <code>addInternalComment</code> function</li>
                          <li>• <strong>Auth:</strong> Uses authenticated user from base44.auth.me()</li>
                        </ul>
                      </div>

                      <div className="bg-gray-800/50 rounded p-3">
                        <h5 className="font-semibold text-white text-sm mb-2">Image Review (Internal)</h5>
                        <ul className="text-xs space-y-1 text-gray-300">
                          <li>• <strong>Visibility:</strong> Only for image_review request type</li>
                          <li>• <strong>Selection:</strong> Checkboxes on images</li>
                          <li>• <strong>Actions:</strong> Approve Selected | Request Changes</li>
                          <li>• <strong>Backend:</strong> <code>publicClientDecision</code> (internal mode)</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                    <h4 className="font-semibold text-red-400 mb-3">Critical Guardrails</h4>
                    <ul className="text-sm space-y-2 text-gray-300">
                      <li>• <strong>MUST NOT:</strong> Allow status change from 'posted' back to 'draft'</li>
                      <li>• <strong>MUST NOT:</strong> Delete request without confirmation dialog</li>
                      <li>• <strong>MUST NOT:</strong> Show internal_only comments in client portal</li>
                      <li>• <strong>MUST:</strong> Invalidate all query keys after mutations</li>
                      <li>• <strong>MUST:</strong> Set server-side timestamps (posted_at, decided_at) not client-side</li>
                      <li>• <strong>MUST:</strong> Enrich all comments/decisions/attachments with author/decider/creator objects before passing to COMP_THREAD_001</li>
                      <li>• <strong>MUST:</strong> Include request.creator object when passing to COMP_THREAD_001</li>
                      <li>• <strong>MUST:</strong> Pass onDecisionSubmit prop to COMP_THREAD_001 for centralized mutation handling</li>
                      </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="apisync" className="space-y-4">
            <Card className="bg-black/60 backdrop-blur-xl border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-red-500" />
                  External Client Portal API Sync Guide
                </CardTitle>
                <p className="text-sm text-gray-400">Synchronization guide for external Base44 client portal projects</p>
              </CardHeader>
              <CardContent className="text-gray-300 space-y-6">
                
                <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-400 mb-2">Overview</h3>
                  <p className="text-sm text-gray-300">This guide ensures that external client portal projects consuming this app's APIs remain synchronized with data structures, business logic, and UI patterns.</p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Backend API Functions Reference</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white">1. publicClientProjects</h4>
                    <div className="bg-gray-900 rounded p-3 text-xs space-y-2">
                      <div>
                        <strong className="text-white">Endpoint:</strong>
                        <code className="text-green-400 ml-2">POST /api/functions/publicClientProjects</code>
                      </div>
                      <div>
                        <strong className="text-white">Input:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "slug": "client-slug-here"  // or use "token" instead
}`}</pre>
                      </div>
                      <div>
                        <strong className="text-white">Output:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "success": true,
  "contact": { id, name, email, url_slug, ... },
  "accesses": [{ project_id, client_contact_id, access_role, ... }],
  "projects": [{ id, name, client_name, featured_image_url, ... }],
  "statuses": [{ label, color, ... }],
  "projectTypes": [{ name, color, ... }]
}`}</pre>
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Purpose:</strong> Lists all projects accessible to the client
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white">2. publicClientPortalData</h4>
                    <div className="bg-gray-900 rounded p-3 text-xs space-y-2">
                      <div>
                        <strong className="text-white">Endpoint:</strong>
                        <code className="text-green-400 ml-2">POST /api/functions/publicClientPortalData</code>
                      </div>
                      <div>
                        <strong className="text-white">Input:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "slug": "client-slug-here",
  "projectId": "project-id-here"
}`}</pre>
                      </div>
                      <div>
                        <strong className="text-white">Output:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "success": true,
  "access": { project_id, access_role, ... },
  "project": { id, name, ... },
  "requests": [{ id, title, request_type, status, due_date, ... }],
  "comments": [{ id, body, author_type, author_id, visibility, ... }],
  "decisions": [{ id, decision, note, target_type, ... }],
  "attachments": [{ id, attachment_type, file_url, link_url, ... }]
}`}</pre>
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Purpose:</strong> Fetches all feedback data for one project
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white">3. publicClientRequestDetail</h4>
                    <div className="bg-gray-900 rounded p-3 text-xs space-y-2">
                      <div>
                        <strong className="text-white">Endpoint:</strong>
                        <code className="text-green-400 ml-2">POST /api/functions/publicClientRequestDetail</code>
                      </div>
                      <div>
                        <strong className="text-white">Input:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "slug": "client-slug-here",
  "requestId": "request-id-here"
}`}</pre>
                      </div>
                      <div>
                        <strong className="text-white">Output:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "success": true,
  "access": { access_role, client_contact_id, ... },
  "request": { 
    id, title, body, request_type, status, due_date,
    creator: { full_name, email, ... }
  },
  "comments": [{ 
    id, body, posted_at,
    author: { name, email, ... }
  }],
  "decisions": [{
    id, decision, note, target_type, decided_at,
    decider: { name, email, ... }
  }],
  "attachments": [{
    id, attachment_type, file_url, link_url, posted_at,
    creator: { name, email, ... }
  }]
}`}</pre>
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Purpose:</strong> Fetches detailed request with enriched author/decider data
                      </div>
                      <div className="text-yellow-400">
                        <strong>⚠️ Important:</strong> All comments, decisions, and attachments include enriched user/contact objects
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white">4. publicAddClientComment</h4>
                    <div className="bg-gray-900 rounded p-3 text-xs space-y-2">
                      <div>
                        <strong className="text-white">Endpoint:</strong>
                        <code className="text-green-400 ml-2">POST /api/functions/publicAddClientComment</code>
                      </div>
                      <div>
                        <strong className="text-white">Input:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "slug": "client-slug-here",
  "requestId": "request-id-here",
  "comment": { "body": "Comment text here" },
  "attachments": [
    { "type": "image", "file_url": "https://..." },
    { "type": "link", "link_url": "https://..." },
    { "type": "file", "file_url": "https://...", "label": "filename.pdf" }
  ]
}`}</pre>
                      </div>
                      <div>
                        <strong className="text-white">Output:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "success": true,
  "comment": { id, body, posted_at, ... },
  "attachments": [{ id, attachment_type, file_url, ... }]
}`}</pre>
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Purpose:</strong> Allows clients to add comments with attachments
                      </div>
                      <div className="text-yellow-400">
                        <strong>⚠️ Important:</strong> Server sets <code>posted_at</code> timestamp automatically
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white">5. publicClientDecision</h4>
                    <div className="bg-gray-900 rounded p-3 text-xs space-y-2">
                      <div>
                        <strong className="text-white">Endpoint:</strong>
                        <code className="text-green-400 ml-2">POST /api/functions/publicClientDecision</code>
                      </div>
                      <div>
                        <strong className="text-white">Input (Request-Level Decision):</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "slug": "client-slug-here",
  "requestId": "request-id-here",
  "decision": "approved" | "changes_requested",
  "note": "Optional note text",
  "targetAttachmentIds": null,
  "newImages": ["https://ref-image-1.jpg", "https://ref-image-2.jpg"]
}`}</pre>
                      </div>
                      <div>
                        <strong className="text-white">Input (Image-Level Decision):</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "slug": "client-slug-here",
  "requestId": "request-id-here",
  "decision": "approved" | "changes_requested",
  "note": "Required for changes_requested",
  "targetAttachmentIds": ["att-id-1", "att-id-2"],
  "newImages": ["https://ref-image.jpg"]
}`}</pre>
                      </div>
                      <div>
                        <strong className="text-white">Output:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "success": true,
  "decisions": [{ id, decision, note, target_type, ... }]
}`}</pre>
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Purpose:</strong> Records client approval or change request decisions
                      </div>
                      <div className="space-y-1 text-yellow-400">
                        <div><strong>⚠️ Critical:</strong> Reference images in <code>newImages</code> are created as attachments</div>
                        <div><strong>⚠️ Critical:</strong> Server sets <code>decided_at</code> and <code>posted_at</code> timestamps</div>
                        <div><strong>⚠️ Critical:</strong> All decisions in batch get same timestamp</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Data Structure Synchronization</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-3">Entity Field Mappings</h4>
                    
                    <div className="space-y-3 text-xs">
                      <div className="bg-gray-900 rounded p-3">
                        <h5 className="font-semibold text-green-400 mb-2">ClientFeedbackRequest</h5>
                        <pre className="text-gray-300 overflow-x-auto">{`{
  id: string,
  project_id: string,
  title: string,
  body: string,
  request_type: "approval" | "question" | "review" | "update" | "image_review",
  status: "draft" | "posted" | "archived",
  due_date: string (date),
  posted_at: string (datetime),
  created_by_user_id: string,
  created_date: string (datetime),
  updated_date: string (datetime)
}`}</pre>
                      </div>

                      <div className="bg-gray-900 rounded p-3">
                        <h5 className="font-semibold text-green-400 mb-2">ClientFeedbackComment</h5>
                        <pre className="text-gray-300 overflow-x-auto">{`{
  id: string,
  request_id: string,
  author_type: "client_contact" | "internal_user",
  author_id: string,
  body: string,
  visibility: "client_visible" | "internal_only",
  target_type: "request" | "attachment_image",
  target_attachment_id: string | null,
  posted_at: string (datetime),
  created_date: string (datetime)
}`}</pre>
                      </div>

                      <div className="bg-gray-900 rounded p-3">
                        <h5 className="font-semibold text-green-400 mb-2">ClientFeedbackDecision</h5>
                        <pre className="text-gray-300 overflow-x-auto">{`{
  id: string,
  request_id: string,
  decided_by_type: "client_contact" | "internal_user",
  decided_by_id: string,
  decision: "approved" | "changes_requested" | "rejected",
  note: string | null,
  target_type: "request" | "attachment_image",
  target_attachment_id: string | null,
  target_image_url: string | null,
  decided_at: string (datetime),
  created_date: string (datetime)
}`}</pre>
                      </div>

                      <div className="bg-gray-900 rounded p-3">
                        <h5 className="font-semibold text-green-400 mb-2">ClientFeedbackAttachment</h5>
                        <pre className="text-gray-300 overflow-x-auto">{`{
  id: string,
  request_id: string,
  comment_id: string | null,
  attachment_type: "image" | "link" | "file",
  file_url: string | null,
  link_url: string | null,
  label: string | null,
  created_by_type: "client_contact" | "internal_user",
  created_by_id: string,
  posted_at: string (datetime),
  created_date: string (datetime)
}`}</pre>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">UI Pattern Synchronization</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-white">Timeline Display Logic</h4>
                    <p className="text-xs text-gray-400">External portal MUST replicate this logic:</p>
                    
                    <div className="bg-gray-900 rounded p-3 text-xs">
                      <h5 className="font-semibold text-white mb-2">Step 1: Calculate Earliest Decision Time</h5>
                      <pre className="text-gray-300 overflow-x-auto">{`const earliestDecisionTime = decisions.length > 0
  ? Math.min(...decisions.map(d => new Date(d.decided_at || d.created_date).getTime()))
  : Infinity;`}</pre>
                    </div>

                    <div className="bg-gray-900 rounded p-3 text-xs">
                      <h5 className="font-semibold text-white mb-2">Step 2: Separate Initial vs Reference Attachments</h5>
                      <pre className="text-gray-300 overflow-x-auto">{`// Initial request attachments (before any decisions)
const requestAttachments = attachments.filter(a => {
  if (a.comment_id) return false;
  const attachmentTime = new Date(a.posted_at || a.created_date).getTime();
  return attachmentTime < earliestDecisionTime;
});`}</pre>
                    </div>

                    <div className="bg-gray-900 rounded p-3 text-xs">
                      <h5 className="font-semibold text-white mb-2">Step 3: Group Decisions by Decider + Time</h5>
                      <pre className="text-gray-300 overflow-x-auto">{`const decisionGroups = {};
decisions.forEach(decision => {
  const timestamp = new Date(decision.decided_at || decision.created_date);
  const roundedTime = Math.floor(timestamp.getTime() / 1000);
  const key = \`\${decision.decided_by_type}_\${decision.decided_by_id}_\${roundedTime}\`;
  if (!decisionGroups[key]) decisionGroups[key] = [];
  decisionGroups[key].push(decision);
});`}</pre>
                    </div>

                    <div className="bg-gray-900 rounded p-3 text-xs">
                       <h5 className="font-semibold text-white mb-2">Step 4: Match Reference Attachments</h5>
                       <pre className="text-gray-300 overflow-x-auto">{`const referenceAttachments = attachments.filter(a => {
                    if (a.comment_id) return false;
                    const attachmentTime = new Date(a.posted_at || a.created_date).getTime();
                    const decisionTime = new Date(decision.decided_at || decision.created_date).getTime();
                    return (
                    a.created_by_type === decision.decided_by_type &&
                    a.created_by_id === decision.decided_by_id &&
                    Math.abs(attachmentTime - decisionTime) < 5000
                    );
                    });`}</pre>
                       <p className="text-yellow-400 mt-2">⚠️ Do NOT include attachmentTime {'>='} earliestDecisionTime check - it incorrectly filters new decision images!</p>
                     </div>

                    <div className="bg-gray-900 rounded p-3 text-xs">
                      <h5 className="font-semibold text-white mb-2">Step 5: Filter Duplicate Comment/Decision Posts</h5>
                      <pre className="text-gray-300 overflow-x-auto">{`const hasMatchingDecision = decisions.some(decision => {
  const decisionTime = new Date(decision.decided_at || decision.created_date).getTime();
  const commentTime = new Date(comment.posted_at || comment.created_date).getTime();
  return decision.decided_by_id === comment.author_id &&
         decision.decided_by_type === comment.author_type &&
         Math.abs(decisionTime - commentTime) < 2000;
});
// Only show comment if !hasMatchingDecision`}</pre>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Request State Calculation</h3>
                  
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                    <p className="text-xs text-gray-400">External portal should use this logic to determine request state badges:</p>
                    
                    <div className="bg-gray-900 rounded p-3 text-xs">
                      <pre className="text-gray-300 overflow-x-auto">{`function getRequestState(request, decisions, attachments) {
  const now = new Date();
  const dueDate = request.due_date ? new Date(request.due_date) : null;
  const isOverdue = dueDate && dueDate < now;

  // Check for global (request-level) decisions
  const globalDecisions = decisions.filter(d => d.target_type === 'request');
  const latestGlobalApproval = globalDecisions
    .filter(d => d.decision === 'approved')
    .sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at))[0];
  const latestGlobalChanges = globalDecisions
    .filter(d => d.decision === 'changes_requested')
    .sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at))[0];

  if (latestGlobalApproval) {
    const approvalTime = new Date(latestGlobalApproval.decided_at);
    const hasNewerChanges = latestGlobalChanges && 
      new Date(latestGlobalChanges.decided_at) > approvalTime;
    
    if (!hasNewerChanges) {
      return { label: 'Approved', color: 'bg-green-500', icon: CheckCircle };
    }
  }

  if (latestGlobalChanges) {
    return { label: 'Changes Requested', color: 'bg-orange-500', icon: AlertCircle };
  }

  // Check image-level decisions
  const imageDecisions = decisions.filter(d => d.target_type === 'attachment_image');
  const requestImages = attachments.filter(a => 
    a.attachment_type === 'image' && !a.comment_id
  );

  if (requestImages.length > 0 && imageDecisions.length > 0) {
    const allApproved = requestImages.every(img => {
      const imgDecisions = imageDecisions
        .filter(d => d.target_attachment_id === img.id)
        .sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at));
      return imgDecisions.length > 0 && imgDecisions[0].decision === 'approved';
    });

    if (allApproved) {
      return { label: 'Approved', color: 'bg-green-500', icon: CheckCircle };
    }

    const anyChanges = imageDecisions.some(d => d.decision === 'changes_requested');
    if (anyChanges) {
      return { label: 'Changes Requested', color: 'bg-orange-500', icon: AlertCircle };
    }
  }

  // Default: Needs Review
  if (isOverdue) {
    return { label: 'Overdue', color: 'bg-red-500', icon: AlertTriangle };
  }

  return { label: 'Needs Review', color: 'bg-blue-500', icon: MessageSquare };
}`}</pre>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-white">6. getClientJournalEntries</h4>
                    <div className="bg-gray-900 rounded p-3 text-xs space-y-2">
                      <div>
                        <strong className="text-white">Endpoint:</strong>
                        <code className="text-green-400 ml-2">POST /api/functions/getClientJournalEntries</code>
                      </div>
                      <div>
                        <strong className="text-white">Input:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "projectId": "project-id-here",
  "slug": "client-slug-here"  // OR use "token" instead
}`}</pre>
                      </div>
                      <div>
                        <strong className="text-white">Output:</strong>
                        <pre className="bg-black rounded p-2 mt-1 text-gray-400 overflow-x-auto">{`{
  "success": true,
  "entries": [
    {
      "id": "entry-id",
      "headline": "Project Update Title",
      "content": "Rich text content of the journal entry...",
      "photos": ["https://photo1.jpg", "https://photo2.jpg"],
      "entry_date": "2025-01-03T12:00:00Z",
      "url": "https://optional-link.com",
      "attachments": [
        { "name": "document.pdf", "url": "https://...", "uploaded_date": "..." }
      ],
      "visibility": "client",
      "created_date": "2025-01-03T12:00:00Z"
    }
  ]
}`}</pre>
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Purpose:</strong> Fetches all journal entries marked as client-visible for a project
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Access Validation:</strong> Validates client access via ProjectClientAccess using slug or token
                      </div>
                      <div className="text-gray-400">
                        <strong className="text-white">Sorting:</strong> Returns entries sorted by entry_date descending (newest first)
                      </div>
                      <div className="text-yellow-400">
                        <strong>⚠️ Important:</strong> Only returns entries where <code>visibility === 'client'</code>. Internal entries are filtered out.
                      </div>
                    </div>
                  </div>

                <div className="bg-purple-900/20 border-2 border-purple-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-xl font-semibold text-purple-400">Synchronization Prompt Template</h3>
                  <p className="text-sm text-gray-300">Use this prompt when updating the external client portal:</p>
                  
                  <div className="bg-gray-900 rounded p-4 text-xs">
                    <pre className="text-gray-300 whitespace-pre-wrap">{`EXTERNAL CLIENT PORTAL SYNC REQUIREMENTS

Context: This is an external Base44 project that consumes APIs from the main project management system.

API Endpoints (Use these exact endpoints):
• POST /api/functions/publicClientProjects - Get all accessible projects
• POST /api/functions/publicClientPortalData - Get project feedback overview
• POST /api/functions/publicClientRequestDetail - Get detailed request with enriched data
• POST /api/functions/publicAddClientComment - Add comment with attachments
• POST /api/functions/publicClientDecision - Record approval or change request
• POST /api/functions/publicManageToDoTask - CRUD operations for ToDo list tasks
• POST /api/functions/getClientJournalEntries - Get client-visible journal entries

Critical Data Structure Rules:
1. ALL API responses include enriched author/decider/creator objects
2. Timestamps: Use posted_at for attachments, decided_at for decisions, created_date for comments
3. Attachment types: "image" | "link" | "file"
4. Decision types: "approved" | "changes_requested" | "rejected"
5. Target types: "request" | "attachment_image"
6. Visibility types: "client_visible" | "internal_only" (filter internal_only from client view)
7. Request types: "question" | "feedback_needed" | "design_review" | "client_need" | "todo_list"

Timeline Display Logic (MUST IMPLEMENT):
1. Calculate earliestDecisionTime from all decisions
2. Initial attachments: created BEFORE earliestDecisionTime AND no comment_id
3. Reference attachments: matched by creator+timestamp ONLY (±5s) - DO NOT check earliestDecisionTime
4. Filter duplicate posts: Remove comments that match decision (same author+timestamp ±2s)
5. Group decisions by decider+timestamp (1s window)
6. Sort all events by timestamp DESC

Request State Calculation (MUST IMPLEMENT):
1. Priority: Global approved > Global changes_requested > Image decisions > Default
2. Check latest global decision first
3. For image reviews: All images must be approved to show "Approved"
4. Default to "Needs Review" or "Overdue" if past due_date

UI Requirements:
• Show request type badges: question, feedback_needed, design_review, client_need, todo_list
• Show state badges: Approved (green), Changes Requested (orange), Needs Review (blue), Overdue (red)
• Timeline posts: Initial Post → Comments → Decision Posts (with reviewed + reference images)
• Image selection: Checkboxes for image_review types (if approver role)
• Decision modal: Note required for changes_requested, optional for approved
• Reference images: Upload alongside decision, displayed in separate section
• ToDo Lists: For todo_list type, show ToDoListDisplay component instead of ClientFeedbackThread

Authentication:
• Use slug-based URL parameter for access (?slug=client-slug)
• No login required - validation done server-side via ProjectClientAccess

Current Changes to Sync:
• CHG-2025-12-23-001 (Part 1): Removed earliestDecisionTime check from referenceAttachments filter in COMP_THREAD_001.
• CHG-2025-12-23-001 (Part 2): Centralized decision submission in CP_FEEDDET_001 via submitDecisionMutation, ensuring proper query invalidation for attachments.
• CHG-2025-12-23-001 (Part 3): Added reviewNewImages state and image upload UI to CP_FEEDDET_001 request decision modal.
• CHG-2025-12-23-001 (Part 4): Fixed quick-approve button to pass reviewNewImages instead of empty array.
• Reference images now match ONLY by: creator match + 5 second time proximity.
• All decision flows (request-level, image-level, quick-approve) now correctly pass newImages.
• NEW: Added todo_list request type with ToDoListTask entity and publicManageToDoTask function.
• NEW: ToDoListDisplay component for managing tasks with assignees, due dates, and images.

Action Required for External Client Portal:
1. Remove earliestDecisionTime check from referenceAttachments matching logic.
2. Ensure decision modals support image uploads (add reviewNewImages state and upload UI).
3. Ensure newImages array is passed to publicClientDecision in ALL decision submission flows (modals, quick-approve buttons).
4. Invalidate attachment queries after decision submissions.
5. NEW: Add ToDoListDisplay component for todo_list request types.
6. NEW: Implement publicManageToDoTask API calls for task CRUD operations.
7. NEW: For todo_list requests, render ToDoListDisplay instead of ClientFeedbackThread.

---

JOURNAL ENTRIES API

Endpoint: POST /api/functions/getClientJournalEntries

Input:
{
  "projectId": "project-id-here",
  "slug": "client-slug-here"  // OR use "token" instead
}

Output:
{
  "success": true,
  "entries": [
    {
      "id": "entry-id",
      "headline": "Update Title",
      "content": "Rich text content...",
      "photos": ["https://..."],
      "entry_date": "2025-01-03T12:00:00Z",
      "url": "https://optional-link.com",
      "attachments": [{ "name": "doc.pdf", "url": "https://..." }],
      "visibility": "client"
    }
  ]
}

Journal Entry Fields:
• headline: Optional title for the entry
• content: Rich text (HTML) content
• photos: Array of image URLs
• entry_date: When the entry was made
• url: Optional related URL
• attachments: Array of { name, url, uploaded_date } objects
• visibility: "client" (visible to clients) or "internal" (team only)

Implementation Notes:
• Only entries with visibility="client" are returned
• Sorted by entry_date descending (newest first)
• Access validated via ProjectClientAccess using slug or token
• Use this to show project updates/progress to clients

---

TODO LIST API

Endpoint: POST /api/functions/publicManageToDoTask

Input (Create):
{
  "slug": "client-slug-here",
  "requestId": "request-id-here",
  "action": "create",
  "task": {
    "title": "Task title",
    "details": "Optional details",
    "assigned_to_id": "user-or-contact-id",
    "assigned_to_type": "internal_user" | "client_contact",
    "due_date": "2025-01-15",
    "image_url": "https://..."
  }
}

Input (Update):
{
  "slug": "client-slug-here",
  "requestId": "request-id-here",
  "action": "update",
  "task": {
    "id": "task-id",
    "is_complete": true,  // or any other field to update
    "title": "Updated title"
  }
}

Input (Delete):
{
  "slug": "client-slug-here",
  "requestId": "request-id-here",
  "action": "delete",
  "task": { "id": "task-id" }
}

Output:
{ "success": true, "result": { ...taskData } }

ToDoListTask Entity Fields:
• request_id: Reference to ClientFeedbackRequest
• title: Task text (required)
• is_complete: Boolean, default false
• assigned_to_id: User or ClientContact ID
• assigned_to_type: "internal_user" | "client_contact"
• details: Optional additional text
• image_url: Optional attached image
• due_date: Optional due date

UI Component: ToDoListDisplay
• Groups tasks by assignee name
• Shows checkboxes to toggle completion
• Supports inline editing via Edit button
• Shows due dates with overdue highlighting
• Expandable details and image preview
• Add task form with all fields
• Delete confirmation dialog`}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}