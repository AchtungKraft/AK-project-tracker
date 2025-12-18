import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Mail, Loader2, Copy, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";

export default function ManageClientAccessModal({ open, onClose, projectId }) {
  const queryClient = useQueryClient();
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', role_title: '' });
  const [editingSlugId, setEditingSlugId] = useState(null);
  const [slugValue, setSlugValue] = useState('');

  const { data: projectAccess = [] } = useQuery({
    queryKey: ['projectClientAccess', projectId],
    queryFn: () => base44.entities.ProjectClientAccess.filter({ project_id: projectId }),
    enabled: open,
  });

  const { data: allClients = [] } = useQuery({
    queryKey: ['clientContacts'],
    queryFn: () => base44.entities.ClientContact.list(),
    enabled: open,
  });

  const createClientMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientContact.create(data),
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ['clientContacts'] });
      toast.success('Client contact created');
      // Automatically add them to the project
      handleAddAccess(newClient.id);
      setNewClient({ name: '', email: '', phone: '', role_title: '' });
      setShowAddClient(false);
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientContact.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientContacts'] });
      toast.success('Client updated');
    },
  });

  const addAccessMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectClientAccess.create(data),
    onSuccess: (newAccess, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      toast.success('Access granted');
      // Send welcome email
      base44.functions.invoke('sendWelcomeEmail', {
        clientContactId: variables.client_contact_id,
        projectId: variables.project_id,
        accessId: newAccess.id
      });
    },
  });

  const updateAccessMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectClientAccess.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      toast.success('Access updated');
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectClientAccess.update(id, { access_status: 'revoked' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      toast.success('Access revoked');
    },
  });

  const activeAccess = projectAccess.filter(a => a.access_status !== 'revoked');
  const clientsWithAccess = activeAccess.map(a => a.client_contact_id);
  const availableClients = allClients.filter(c => c.active && !clientsWithAccess.includes(c.id));

  const getClientDetails = (clientId) => allClients.find(c => c.id === clientId);

  const handleCreateClient = (e) => {
    e.preventDefault();
    createClientMutation.mutate(newClient);
  };

  const handleAddAccess = (clientId) => {
    // Generate unique share token
    const shareToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    addAccessMutation.mutate({
      project_id: projectId,
      client_contact_id: clientId,
      access_role: 'approver',
      access_status: 'active',
      share_token: shareToken,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 text-white max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Client Access</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">Active Clients</h3>
              <Button
                size="sm"
                onClick={() => setShowAddClient(!showAddClient)}
                variant="outline"
                className="border-gray-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                {showAddClient ? 'Cancel' : 'Add Client'}
              </Button>
            </div>

            {showAddClient && (
              <form onSubmit={handleCreateClient} className="bg-gray-800 p-4 rounded-lg mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      placeholder="Client name"
                      className="bg-gray-900 border-gray-700 text-white"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      placeholder="client@example.com"
                      className="bg-gray-900 border-gray-700 text-white"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      placeholder="Phone (optional)"
                      className="bg-gray-900 border-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Role</Label>
                    <Input
                      value={newClient.role_title}
                      onChange={(e) => setNewClient({ ...newClient, role_title: e.target.value })}
                      placeholder="Role (optional)"
                      className="bg-gray-900 border-gray-700 text-white"
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={createClientMutation.isPending} className="bg-red-600 hover:bg-red-700">
                  {createClientMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create & Add to Project'}
                </Button>
              </form>
            )}

            {availableClients.length > 0 && !showAddClient && (
              <div className="mb-4">
                <Label className="text-xs text-gray-400 mb-2 block">Add existing client</Label>
                <Select onValueChange={handleAddAccess}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select a client to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} ({client.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              {activeAccess.length === 0 ? (
                <p className="text-gray-400 text-sm">No clients have access yet</p>
              ) : (
                activeAccess.map(access => {
                  const client = getClientDetails(access.client_contact_id);
                  if (!client) return null;

                  const shareUrl = client.url_slug
                    ? `${window.location.origin}${createPageUrl("ClientProjects")}?slug=${client.url_slug}`
                    : `${window.location.origin}${createPageUrl("ClientProjects")}?token=${access.share_token}`;
                  
                  return (
                    <div key={access.id} className="bg-gray-800 p-3 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-white">{client.name}</span>
                            <Badge className={cn("text-xs capitalize", 
                              access.access_role === 'approver' ? "bg-blue-500/20 text-blue-400 border-blue-500/50 border" :
                              access.access_role === 'commenter' ? "bg-green-500/20 text-green-400 border-green-500/50 border" :
                              "bg-gray-500/20 text-gray-400 border-gray-500/50 border"
                            )}>
                              {access.access_role}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-400">{client.email}</p>
                          {access.last_viewed_at && (
                            <p className="text-xs text-gray-500">
                              Last viewed: {format(new Date(access.last_viewed_at), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={access.access_role}
                            onValueChange={(value) => updateAccessMutation.mutate({ id: access.id, data: { access_role: value } })}
                          >
                            <SelectTrigger className="w-32 bg-gray-900 border-gray-700 text-white h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="commenter">Commenter</SelectItem>
                              <SelectItem value="approver">Approver</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => revokeAccessMutation.mutate(access.id)}
                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={shareUrl}
                            readOnly
                            className="bg-gray-900 border-gray-700 text-white text-xs h-8"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(shareUrl);
                              toast.success('Link copied!');
                            }}
                            className="border-gray-700 whitespace-nowrap h-8 text-xs"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {editingSlugId === client.id ? (
                            <>
                              <div className="flex items-center bg-gray-900 rounded-md border border-gray-700 px-2 h-8 flex-1">
                                <span className="text-gray-500 text-xs whitespace-nowrap mr-1">?slug=</span>
                                <input
                                  type="text"
                                  value={slugValue}
                                  onChange={(e) => setSlugValue(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                                  placeholder="client-name"
                                  className="bg-transparent border-none text-white text-xs w-full focus:outline-none"
                                />
                              </div>
                              <Button
                                size="sm"
                                onClick={() => {
                                  updateClientMutation.mutate({ id: client.id, data: { url_slug: slugValue } });
                                  setEditingSlugId(null);
                                }}
                                className="h-8 bg-green-600 hover:bg-green-700"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingSlugId(null)}
                                className="h-8 text-gray-400"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2 w-full">
                              <span className="text-xs text-gray-500">
                                Client Slug: {client.url_slug || <span className="italic">none</span>}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingSlugId(client.id);
                                  setSlugValue(client.url_slug || '');
                                }}
                                className="h-6 w-6 text-gray-400 hover:text-white"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-300 mb-1">Share Client Portal</h4>
                <p className="text-sm text-gray-300">
                  Copy the unique link for each client above and send it to them via email or message. Each link is personalized and secure.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-700">
          <Button onClick={onClose} variant="outline" className="border-gray-700">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}