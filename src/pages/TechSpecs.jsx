import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Code, Database, FileText, Users, Package, FolderKanban, CheckSquare, MessageSquare, Calendar } from "lucide-react";

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
          <TabsList className="bg-gray-800 border border-gray-700">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="entities">Entities</TabsTrigger>
            <TabsTrigger value="functions">Backend Functions</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
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
                      <strong>Key Fields:</strong> project_id, title, body, request_type (approval, question, review, update, image_review), status (draft, posted, archived), due_date
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
                      <strong>Returns:</strong> request with comments, decisions, attachments (all enriched with user/contact details)<br/>
                      <strong>Auth:</strong> Public (slug-based access validation)
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
        </Tabs>
      </div>
    </div>
  );
}