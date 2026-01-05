import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  FolderKanban,
  Plus,
  Trash2,
  Search,
  Mail,
  Phone,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

export default function ClientPortalAdminTab() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedClients, setExpandedClients] = useState({});
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", url_slug: "" });

  // Fetch all data
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["clientContacts"],
    queryFn: () => base44.entities.ClientContact.filter({ active: true }),
  });

  const { data: projectAccess = [], isLoading: loadingAccess } = useQuery({
    queryKey: ["projectClientAccess"],
    queryFn: () => base44.entities.ProjectClientAccess.list(),
  });

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  // Mutations
  const removeAccessMutation = useMutation({
    mutationFn: (accessId) => base44.entities.ProjectClientAccess.delete(accessId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectClientAccess"] });
      toast.success("Project access removed");
    },
    onError: () => toast.error("Failed to remove access"),
  });

  const addAccessMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectClientAccess.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectClientAccess"] });
      setShowAddProjectModal(false);
      setSelectedProjectId("");
      toast.success("Project access granted");
    },
    onError: () => toast.error("Failed to add access"),
  });

  const createClientMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientContact.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientContacts"] });
      setShowAddClientModal(false);
      setNewClient({ name: "", email: "", phone: "", url_slug: "" });
      toast.success("Client created");
    },
    onError: () => toast.error("Failed to create client"),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId) => {
      // First remove all project accesses for this client
      const accesses = projectAccess.filter(pa => pa.client_contact_id === clientId);
      await Promise.all(accesses.map(a => base44.entities.ProjectClientAccess.delete(a.id)));
      // Then delete the client
      return base44.entities.ClientContact.delete(clientId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientContacts"] });
      queryClient.invalidateQueries({ queryKey: ["projectClientAccess"] });
      toast.success("Client deleted");
    },
    onError: () => toast.error("Failed to delete client"),
  });

  // Filter clients by search
  const filteredClients = clients.filter(
    (client) =>
      client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get projects for a client
  const getClientProjects = (clientId) => {
    const accessRecords = projectAccess.filter(
      (pa) => pa.client_contact_id === clientId && pa.access_status !== "revoked"
    );
    return accessRecords.map((access) => {
      const project = projects.find((p) => p.id === access.project_id);
      return { ...access, project };
    });
  };

  // Get projects not yet assigned to a client
  const getAvailableProjects = (clientId) => {
    const assignedProjectIds = projectAccess
      .filter((pa) => pa.client_contact_id === clientId && pa.access_status !== "revoked")
      .map((pa) => pa.project_id);
    return projects.filter((p) => !assignedProjectIds.includes(p.id));
  };

  const toggleClient = (clientId) => {
    setExpandedClients((prev) => ({
      ...prev,
      [clientId]: !prev[clientId],
    }));
  };

  const handleAddProject = () => {
    if (!selectedProjectId || !selectedClient) return;
    addAccessMutation.mutate({
      project_id: selectedProjectId,
      client_contact_id: selectedClient.id,
      access_role: "approver",
      access_status: "active",
    });
  };

  const isLoading = loadingClients || loadingAccess || loadingProjects;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Add */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700 text-white"
          />
        </div>
        <Button
          onClick={() => setShowAddClientModal(true)}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Active Clients</p>
            <p className="text-2xl font-bold text-white">{clients.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Total Projects</p>
            <p className="text-2xl font-bold text-white">{projects.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Active Access</p>
            <p className="text-2xl font-bold text-white">
              {projectAccess.filter((pa) => pa.access_status === "active").length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Clients with Access</p>
            <p className="text-2xl font-bold text-white">
              {new Set(projectAccess.filter((pa) => pa.access_status === "active").map((pa) => pa.client_contact_id)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {filteredClients.length === 0 ? (
          <Card className="bg-black/40 border-gray-700">
            <CardContent className="p-8 text-center text-gray-400">
              No active clients found
            </CardContent>
          </Card>
        ) : (
          filteredClients.map((client) => {
            const clientProjects = getClientProjects(client.id);
            const isExpanded = expandedClients[client.id];

            return (
              <Card
                key={client.id}
                className="bg-black/40 border-gray-700 overflow-hidden"
              >
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => toggleClient(client.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                      <span className="text-white font-bold">
                        {client.name?.[0]?.toUpperCase() || "C"}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{client.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-400">
                        {client.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {client.email}
                          </span>
                        )}
                        {client.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {client.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge className="bg-gray-800 text-gray-300 border-gray-700">
                      <FolderKanban className="w-3 h-3 mr-1" />
                      {clientProjects.length} projects
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete client "${client.name}"? This will also remove all project access.`)) {
                          deleteClientMutation.mutate(client.id);
                        }
                      }}
                      className="text-gray-500 hover:text-red-500 hover:bg-gray-800 h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-800 p-4 bg-gray-900/30">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                        Project Access
                      </h4>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClient(client);
                          setShowAddProjectModal(true);
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add Project
                      </Button>
                    </div>

                    {clientProjects.length === 0 ? (
                      <p className="text-gray-500 text-sm py-4 text-center">
                        No projects assigned to this client
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {clientProjects.map((access) => (
                          <div
                            key={access.id}
                            className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <FolderKanban className="w-4 h-4 text-red-400" />
                              <div>
                                <p className="text-white text-sm font-medium">
                                  {access.project?.name || "Unknown Project"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {access.project?.client_name}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                className={
                                  access.access_status === "active"
                                    ? "bg-green-500/20 text-green-400 border-green-500/50"
                                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                                }
                              >
                                {access.access_status}
                              </Badge>
                              <Badge className="bg-gray-700 text-gray-300">
                                {access.access_role}
                              </Badge>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Remove this project access?")) {
                                    removeAccessMutation.mutate(access.id);
                                  }
                                }}
                                className="text-gray-500 hover:text-red-500 hover:bg-gray-800 h-8 w-8"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Add Project Modal */}
      <Dialog open={showAddProjectModal} onOpenChange={setShowAddProjectModal}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Add Project Access for {selectedClient?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">
                Select Project
              </label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedClient &&
                    getAvailableProjects(selectedClient.id).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddProjectModal(false);
                setSelectedProjectId("");
              }}
              className="border-gray-600 text-gray-200 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddProject}
              disabled={!selectedProjectId || addAccessMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {addAccessMutation.isPending ? "Adding..." : "Add Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Client Modal */}
      <Dialog open={showAddClientModal} onOpenChange={setShowAddClientModal}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Name *</label>
              <Input
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                placeholder="Client name"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Email *</label>
              <Input
                type="email"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                placeholder="client@example.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Phone</label>
              <Input
                value={newClient.phone}
                onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Portal Slug</label>
              <Input
                value={newClient.url_slug}
                onChange={(e) => setNewClient({ ...newClient, url_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder="client-slug"
                className="bg-gray-800 border-gray-700 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Used for portal access URL</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddClientModal(false);
                setNewClient({ name: "", email: "", phone: "", url_slug: "" });
              }}
              className="border-gray-600 text-gray-200 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createClientMutation.mutate({ ...newClient, active: true })}
              disabled={!newClient.name || !newClient.email || createClientMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {createClientMutation.isPending ? "Creating..." : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}