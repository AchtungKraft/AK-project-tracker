import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Mail, Loader2, Copy, Pencil, Check, X, Send, UserPlus, AlertTriangle } from "lucide-react";
import CommPrefsDisplay from "@/components/clientportal/CommPrefsDisplay";
import ClientSearchPicker from "@/components/clientportal/ClientSearchPicker";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { buildPublicClientUrl } from "@/lib/clientPortalUrls";

export default function ManageClientAccessModal({ open, onClose, projectId }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', role_title: '', url_slug: '' });
  const [editingSlugId, setEditingSlugId] = useState(null);
  const [slugValue, setSlugValue] = useState('');

  // Search + select + explicit-add state
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedRole, setSelectedRole] = useState('approver');
  const [justAdded, setJustAdded] = useState(null); // { accessId, clientContactId, emailStatus: 'sending'|'sent'|'failed'|'no_email', emailDetail? }

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
      toast({ description: 'Client contact created' });
      // Automatically add them to the project with their slug
      handleAddAccessWithClient(newClient);
      setNewClient({ name: '', email: '', phone: '', role_title: '', url_slug: '' });
      setShowAddClient(false);
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientContact.update(id, data),
    onSuccess: (updatedClient) => {
      queryClient.invalidateQueries({ queryKey: ['clientContacts'] });
      toast({ description: 'Client updated' });
      
      // Update url_slug in all ProjectClientAccess records for this client
      const clientAccesses = projectAccess.filter(a => a.client_contact_id === updatedClient.id);
      clientAccesses.forEach(access => {
        base44.entities.ProjectClientAccess.update(access.id, { url_slug: updatedClient.url_slug });
      });
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
    },
  });

  const addAccessMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectClientAccess.create(data),
    onSuccess: async (newAccess, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      const client = allClients.find(c => c.id === variables.client_contact_id);
      const clientName = client?.name || 'Client';
      const clientEmail = client?.email;

      // Show immediate "sending" state
      setJustAdded({ accessId: newAccess.id, clientContactId: variables.client_contact_id, emailStatus: 'sending' });
      setSelectedClient(null);
      setSelectedRole('approver');

      // Automatically send the access notification (separate from access creation)
      try {
        const response = await base44.functions.invoke('sendClientAccessNotification', {
          clientContactId: variables.client_contact_id,
          projectId,
          accessId: newAccess.id,
        });
        const data = response.data;
        if (data.success && data.channels_sent?.length > 0) {
          setJustAdded(prev => prev?.accessId === newAccess.id
            ? { ...prev, emailStatus: 'sent', emailDetail: `Access email sent to ${clientEmail || clientName}.` }
            : prev
          );
          queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
        } else {
          // Notification function succeeded but didn't send (e.g. no valid email/channel)
          setJustAdded(prev => prev?.accessId === newAccess.id
            ? { ...prev, emailStatus: 'no_email', emailDetail: 'No valid email address or communication channel available.' }
            : prev
          );
        }
      } catch (emailError) {
        // Access was created successfully, but email failed — don't roll back
        setJustAdded(prev => prev?.accessId === newAccess.id
          ? { ...prev, emailStatus: 'failed', emailDetail: 'Access email could not be sent.' }
          : prev
        );
      }
    },
    onError: (error) => {
      const msg = error?.response?.data?.error || error.message;
      toast({ variant: "destructive", description: msg || 'Failed to add client access. Please try again.' });
    },
  });

  const updateAccessMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectClientAccess.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      toast({ description: 'Access updated' });
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectClientAccess.update(id, { access_status: 'revoked' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      toast({ description: 'Access revoked' });
    },
  });

  const [sendingNotifId, setSendingNotifId] = useState(null);

  const sendNotificationMutation = useMutation({
    mutationFn: ({ clientContactId, accessId }) =>
      base44.functions.invoke('sendClientAccessNotification', {
        clientContactId,
        projectId,
        accessId,
      }),
    onSuccess: (response, variables) => {
      const data = response.data;
      if (data.success) {
        toast({ description: `Notification sent via ${data.channels_sent.join(', ')}` });
        queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      }
      setSendingNotifId(null);
    },
    onError: (error) => {
      const msg = error?.response?.data?.error || error.message;
      toast({ variant: "destructive", description: msg || 'Failed to send notification' });
      setSendingNotifId(null);
    },
  });

  const activeAccess = projectAccess.filter(a => a.access_status !== 'revoked');
  const clientsWithAccess = activeAccess.map(a => a.client_contact_id);
  const availableClients = allClients.filter(c => c.active && !clientsWithAccess.includes(c.id));

  const getClientDetails = (clientId) => allClients.find(c => c.id === clientId);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    
    // Check if client with slug already exists
    if (newClient.url_slug) {
      const existingClient = allClients.find(c => c.url_slug === newClient.url_slug && c.active);
      if (existingClient) {
        // Use existing client instead of creating new one
        handleAddAccessWithClient(existingClient);
        setNewClient({ name: '', email: '', phone: '', role_title: '', url_slug: '' });
        setShowAddClient(false);
        toast({ description: 'Added existing client with matching slug' });
        return;
      }
    }
    
    createClientMutation.mutate(newClient);
  };

  const handleAddAccessWithClient = (client, role = 'approver') => {
    // Generate unique share token
    const shareToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    addAccessMutation.mutate({
      project_id: projectId,
      client_contact_id: client.id,
      access_role: role,
      access_status: 'active',
      share_token: shareToken,
      url_slug: client.url_slug || null,
    });
  };

  const handleAddAccess = useCallback(() => {
    if (!selectedClient || addAccessMutation.isPending) return;
    handleAddAccessWithClient(selectedClient, selectedRole);
  }, [selectedClient, selectedRole, addAccessMutation.isPending]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 text-white max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Client Access</DialogTitle>
          <DialogDescription>
            Add or remove client access to this project's portal.
          </DialogDescription>
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
                  <div>
                    <Label className="text-xs">URL Slug (optional)</Label>
                    <Input
                      value={newClient.url_slug}
                      onChange={(e) => setNewClient({ ...newClient, url_slug: e.target.value.replace(/[^a-zA-Z0-9-_]/g, '') })}
                      placeholder="client-name"
                      className="bg-gray-900 border-gray-700 text-white"
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={createClientMutation.isPending} className="bg-red-600 hover:bg-red-700">
                  {createClientMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create & Add to Project'}
                </Button>
              </form>
            )}

            {!showAddClient && (
              <div className="mb-4 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 space-y-3">
                <Label className="text-xs text-gray-300 font-semibold uppercase tracking-wide block">
                  Add Existing Client
                </Label>

                {/* SELECTED CLIENT PREVIEW */}
                {selectedClient ? (
                  <div className="space-y-3">
                    <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Selected Client</div>
                          <div className="text-sm font-medium text-white">{selectedClient.name}</div>
                          {selectedClient.email && (
                            <div className="text-xs text-gray-400">{selectedClient.email}</div>
                          )}
                          {selectedClient.role_title && (
                            <div className="text-xs text-gray-500 mt-0.5">{selectedClient.role_title}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSelectedClient(null); setJustAdded(null); }}
                          className="text-gray-500 hover:text-gray-300 p-1 rounded"
                          title="Change client"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-gray-400 mb-1 block">Access Role</Label>
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                          <SelectTrigger className="bg-gray-900 border-gray-700 text-white h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="commenter">Commenter</SelectItem>
                            <SelectItem value="approver">Approver</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSelectedClient(null); setJustAdded(null); }}
                          className="border-gray-700 h-9"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={addAccessMutation.isPending || (justAdded?.emailStatus === 'sending')}
                          onClick={handleAddAccess}
                          className="bg-red-600 hover:bg-red-700 h-9 gap-1.5 whitespace-nowrap"
                        >
                          {(addAccessMutation.isPending || justAdded?.emailStatus === 'sending') ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                          Add Client Access
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* SEARCH PICKER */
                  <ClientSearchPicker
                    allClients={allClients}
                    assignedClientIds={clientsWithAccess}
                    onSelect={(client) => { setSelectedClient(client); setJustAdded(null); }}
                  />
                )}

                {/* Post-add status banner */}
                {justAdded && !selectedClient && (
                  <div className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2",
                    justAdded.emailStatus === 'sending' ? "bg-blue-950/30 border border-blue-900/40" :
                    justAdded.emailStatus === 'sent' ? "bg-green-950/30 border border-green-900/40" :
                    "bg-amber-950/30 border border-amber-900/40"
                  )}>
                    {justAdded.emailStatus === 'sending' ? (
                      <>
                        <Loader2 className="w-4 h-4 text-blue-400 shrink-0 animate-spin" />
                        <span className="text-sm text-blue-300 flex-1">Adding client access and sending invite…</span>
                      </>
                    ) : justAdded.emailStatus === 'sent' ? (
                      <>
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-sm text-green-300 flex-1">
                          {justAdded.emailDetail || 'Client added and access email sent.'}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm text-amber-300 flex-1">
                          Client access added{justAdded.emailStatus === 'failed' ? ', but the access email could not be sent.' : '. ' + (justAdded.emailDetail || 'No email was sent.')}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendingNotifId === justAdded.accessId || sendNotificationMutation.isPending}
                          onClick={() => {
                            setSendingNotifId(justAdded.accessId);
                            sendNotificationMutation.mutate({
                              clientContactId: justAdded.clientContactId,
                              accessId: justAdded.accessId,
                            });
                            setJustAdded(null);
                          }}
                          className="h-8 text-xs border-amber-800 text-amber-300 hover:bg-amber-950/50 gap-1 whitespace-nowrap"
                        >
                          <Send className="w-3 h-3" />
                          Send Access Link
                        </Button>
                      </>
                    )}
                  </div>
                )}
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
                    ? buildPublicClientUrl({ type: 'portal', slug: client.url_slug })
                    : null;
                  
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
                            size="sm"
                            variant="outline"
                            disabled={sendingNotifId === access.id || sendNotificationMutation.isPending}
                            onClick={() => {
                              setSendingNotifId(access.id);
                              sendNotificationMutation.mutate({
                                clientContactId: access.client_contact_id,
                                accessId: access.id,
                              });
                            }}
                            className="h-8 text-xs border-gray-700 gap-1"
                          >
                            {sendingNotifId === access.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            Send Access Link
                          </Button>
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

                      {/* Communication Preferences */}
                      <CommPrefsDisplay client={client} />

                      {/* Last notification sent */}
                      {access.last_notification_sent_at && (
                        <p className="text-[10px] text-gray-500">
                          Last notification sent: {format(new Date(access.last_notification_sent_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={shareUrl || 'No slug assigned — set a client slug below'}
                            readOnly
                            className="bg-gray-900 border-gray-700 text-white text-xs h-8"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!shareUrl}
                            onClick={() => {
                              if (shareUrl) {
                                navigator.clipboard.writeText(shareUrl);
                                toast({ description: 'Portal link copied' });
                              }
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