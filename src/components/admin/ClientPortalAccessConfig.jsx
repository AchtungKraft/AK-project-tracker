import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2, Search, Users, FolderKanban, AlertTriangle,
  Edit2, ChevronDown, ChevronRight, Send, Copy,
  Trash2, Mail, MessageSquare, Phone, UserX, Pencil,
  Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { buildPublicClientUrl } from "@/lib/clientPortalUrls";
import CommPrefsDisplay from "@/components/clientportal/CommPrefsDisplay";

// ── Compact comm prefs inline (for list rows) ──
function CommPrefsInline({ client }) {
  if (!client) return null;
  const e = client.notify_email !== false;
  const s = client.notify_sms === true;
  const w = client.notify_whatsapp === true;
  return (
    <div className="flex items-center gap-1.5">
      <Mail className={cn("w-3 h-3", e ? "text-green-400" : "text-gray-600")} />
      <MessageSquare className={cn("w-3 h-3", s ? "text-green-400" : "text-gray-600")} />
      <Phone className={cn("w-3 h-3", w ? "text-green-400" : "text-gray-600")} />
    </div>
  );
}

// ── Integrity helpers ──
function computeIntegrity(accessRecords, clientMap, projectMap) {
  const issues = { safe: [], review: [] };
  const pairCounts = {};
  const slugs = {};

  accessRecords.filter(a => a.access_status !== 'revoked').forEach(a => {
    if (!clientMap.has(a.client_contact_id)) {
      issues.review.push({ type: 'orphan_client', id: a.id, message: `Access record references deleted client ${a.client_contact_id?.slice(-6)}` });
    }
    if (!projectMap.has(a.project_id)) {
      issues.review.push({ type: 'orphan_project', id: a.id, message: `Access record references deleted project ${a.project_id?.slice(-6)}` });
    }
    const key = `${a.project_id}::${a.client_contact_id}`;
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });

  Object.entries(pairCounts).filter(([, c]) => c > 1).forEach(([pair]) => {
    const [pid, cid] = pair.split('::');
    issues.safe.push({
      type: 'duplicate',
      message: `Duplicate access: ${projectMap.get(pid)?.name || pid.slice(-6)} ↔ ${clientMap.get(cid)?.name || cid.slice(-6)}`,
    });
  });

  for (const c of clientMap.values()) {
    if (c.url_slug) {
      if (!slugs[c.url_slug]) slugs[c.url_slug] = [];
      slugs[c.url_slug].push(c.name);
    }
  }
  Object.entries(slugs).filter(([, names]) => names.length > 1).forEach(([slug, names]) => {
    issues.review.push({ type: 'dup_slug', message: `Duplicate slug "${slug}": ${names.join(', ')}` });
  });

  return issues;
}

// ── Project-centric edit drawer ──
function ProjectAccessDrawer({ project, allAccess, allClients, statuses, onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sendingId, setSendingId] = useState(null);
  const [editSlugClientId, setEditSlugClientId] = useState(null);
  const [slugDraft, setSlugDraft] = useState('');

  const activeAccess = allAccess.filter(a => a.project_id === project.id && a.access_status !== 'revoked');
  const clientMap = new Map(allClients.map(c => [c.id, c]));
  const status = statuses.find(s => s.id === project.status_id);

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }) => base44.entities.ProjectClientAccess.update(id, { access_role: role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      queryClient.invalidateQueries({ queryKey: ['clientAccessAdmin'] });
      toast({ description: 'Role updated' });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectClientAccess.update(id, { access_status: 'revoked' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
      queryClient.invalidateQueries({ queryKey: ['clientAccessAdmin'] });
      toast({ description: 'Access revoked' });
    },
  });

  const updateSlugMutation = useMutation({
    mutationFn: ({ clientId, slug }) => base44.entities.ClientContact.update(clientId, { url_slug: slug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientContacts'] });
      queryClient.invalidateQueries({ queryKey: ['clientAccessAdmin'] });
      setEditSlugClientId(null);
      toast({ description: 'Slug updated' });
    },
  });

  const sendNotification = async (access) => {
    setSendingId(access.id);
    try {
      const res = await base44.functions.invoke('sendClientAccessNotification', {
        clientContactId: access.client_contact_id,
        projectId: project.id,
        accessId: access.id,
      });
      if (res.data?.success) {
        toast({ description: `Notification sent via ${res.data.channels_sent.join(', ')}` });
        queryClient.invalidateQueries({ queryKey: ['projectClientAccess'] });
        queryClient.invalidateQueries({ queryKey: ['clientAccessAdmin'] });
      }
    } catch (e) {
      toast({ variant: 'destructive', description: 'Failed to send notification' });
    }
    setSendingId(null);
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="bg-gray-900 border-l border-red-900/30 text-white w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-white text-lg">{project.name}</SheetTitle>
          {status && (
            <Badge style={{ backgroundColor: status.color }} className="text-white text-xs w-fit">
              {status.label}
            </Badge>
          )}
        </SheetHeader>

        <div className="space-y-3">
          {activeAccess.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">No clients have portal access.</p>
          ) : activeAccess.map(access => {
            const client = clientMap.get(access.client_contact_id);
            if (!client) return null;
            const url = client.url_slug ? buildPublicClientUrl({ type: 'portal', slug: client.url_slug }) : null;

            return (
              <div key={access.id} className="bg-gray-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-white">{client.name}</span>
                    <p className="text-xs text-gray-400">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={access.access_role}
                      onValueChange={(v) => updateRoleMutation.mutate({ id: access.id, role: v })}
                    >
                      <SelectTrigger className="h-7 w-28 text-[11px] bg-gray-900 border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="commenter">Commenter</SelectItem>
                        <SelectItem value="approver">Approver</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-gray-400 hover:text-white"
                      disabled={sendingId === access.id}
                      onClick={() => sendNotification(access)}
                    >
                      {sendingId === access.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-red-400 hover:text-red-300"
                      onClick={() => revokeMutation.mutate(access.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <CommPrefsDisplay client={client} />

                {access.last_viewed_at && (
                  <p className="text-[10px] text-gray-500">Last viewed: {format(new Date(access.last_viewed_at), 'MMM d, yyyy')}</p>
                )}
                {access.last_notification_sent_at && (
                  <p className="text-[10px] text-gray-500">Last notification: {format(new Date(access.last_notification_sent_at), 'MMM d, yyyy h:mm a')}</p>
                )}

                {/* URL + Slug */}
                <div className="space-y-1">
                  {url ? (
                    <div className="flex items-center gap-1.5">
                      <Input value={url} readOnly className="text-[11px] h-7 bg-gray-900 border-gray-700 text-white" />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 shrink-0"
                        onClick={() => { navigator.clipboard.writeText(url); toast({ description: 'URL copied' }); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-500 italic">No slug — set below to generate URL</p>
                  )}

                  {editSlugClientId === client.id ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center bg-gray-900 rounded border border-gray-700 px-2 h-7 flex-1">
                        <span className="text-gray-500 text-[10px] mr-1">slug=</span>
                        <input value={slugDraft} onChange={(e) => setSlugDraft(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                          className="bg-transparent border-none text-white text-[11px] w-full focus:outline-none" />
                      </div>
                      <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700"
                        onClick={() => updateSlugMutation.mutate({ clientId: client.id, slug: slugDraft })}>
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400"
                        onClick={() => setEditSlugClientId(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500">Slug: {client.url_slug || <span className="italic">none</span>}</span>
                      <button className="text-gray-500 hover:text-white" onClick={() => { setEditSlugClientId(client.id); setSlugDraft(client.url_slug || ''); }}>
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800">
          <Button variant="outline" onClick={onClose} className="w-full">Done</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Component ──
export default function ClientPortalAccessConfig() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState('project');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showIntegrity, setShowIntegrity] = useState(false);
  const [editProject, setEditProject] = useState(null);

  const { data: accessRecords = [], isLoading: l1 } = useQuery({
    queryKey: ['clientAccessAdmin'],
    queryFn: () => base44.entities.ProjectClientAccess.list('-created_date', 500),
  });
  const { data: allClients = [], isLoading: l2 } = useQuery({
    queryKey: ['clientContacts'],
    queryFn: () => base44.entities.ClientContact.list('-created_date', 500),
  });
  const { data: projects = [], isLoading: l3 } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date', 500),
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => base44.entities.StatusList.list(),
  });
  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const isLoading = l1 || l2 || l3;

  const clientMap = useMemo(() => new Map(allClients.map(c => [c.id, c])), [allClients]);
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const projectStatuses = useMemo(() => statuses.filter(s => s.scope === 'Project'), [statuses]);
  const statusMap = useMemo(() => new Map(projectStatuses.map(s => [s.id, s])), [projectStatuses]);

  const completedStatusIds = useMemo(() => {
    const labels = ['completed', 'complete', 'archived', 'cancelled', 'closed', 'delivered'];
    return new Set(projectStatuses.filter(s => labels.some(l => s.label?.toLowerCase().includes(l))).map(s => s.id));
  }, [projectStatuses]);

  const activeAccess = useMemo(() => accessRecords.filter(a => a.access_status !== 'revoked'), [accessRecords]);

  const integrity = useMemo(() => computeIntegrity(accessRecords, clientMap, projectMap), [accessRecords, clientMap, projectMap]);
  const issueCount = integrity.safe.length + integrity.review.length;

  // ── PROJECT VIEW data ──
  const projectViewData = useMemo(() => {
    // group active access by project
    const byProject = {};
    activeAccess.forEach(a => {
      if (!byProject[a.project_id]) byProject[a.project_id] = [];
      byProject[a.project_id].push(a);
    });

    return Object.entries(byProject)
      .map(([pid, records]) => ({ project: projectMap.get(pid), records }))
      .filter(({ project, records }) => {
        if (!project) return false;
        if (!showCompleted && completedStatusIds.has(project.status_id)) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchesProject = project.name?.toLowerCase().includes(q);
          const matchesClient = records.some(r => {
            const c = clientMap.get(r.client_contact_id);
            return c?.name?.toLowerCase().includes(q) || c?.email?.toLowerCase().includes(q) || c?.url_slug?.toLowerCase().includes(q);
          });
          if (!matchesProject && !matchesClient) return false;
        }
        if (filterRole !== 'all' && !records.some(r => r.access_role === filterRole)) return false;
        if (filterStatus !== 'all' && project.status_id !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => (b.project?.created_date || '').localeCompare(a.project?.created_date || ''));
  }, [activeAccess, projectMap, clientMap, search, filterRole, filterStatus, showCompleted, completedStatusIds]);

  // ── CLIENT VIEW data ──
  const clientViewData = useMemo(() => {
    const byClient = {};
    activeAccess.forEach(a => {
      if (!byClient[a.client_contact_id]) byClient[a.client_contact_id] = [];
      byClient[a.client_contact_id].push(a);
    });

    return Object.entries(byClient)
      .map(([cid, records]) => ({ client: clientMap.get(cid), records }))
      .filter(({ client, records }) => {
        if (!client) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchesClient = client.name?.toLowerCase().includes(q) || client.email?.toLowerCase().includes(q) || client.url_slug?.toLowerCase().includes(q);
          const matchesProject = records.some(r => projectMap.get(r.project_id)?.name?.toLowerCase().includes(q));
          if (!matchesClient && !matchesProject) return false;
        }
        if (filterRole !== 'all' && !records.some(r => r.access_role === filterRole)) return false;
        if (!showCompleted) {
          // Keep client if at least one access is to a non-completed project
          const hasActive = records.some(r => !completedStatusIds.has(projectMap.get(r.project_id)?.status_id));
          if (!hasActive) return false;
        }
        return true;
      })
      .sort((a, b) => b.records.length - a.records.length);
  }, [activeAccess, clientMap, projectMap, search, filterRole, showCompleted, completedStatusIds]);

  if (isLoading) {
    return (
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardContent className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-white text-base">Client Portal Access</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeAccess.length} active records · {new Set(activeAccess.map(a => a.client_contact_id)).size} clients · {new Set(activeAccess.map(a => a.project_id)).size} projects
              </p>
            </div>
            {issueCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowIntegrity(v => !v)}
                className="border-yellow-600/40 text-yellow-400 hover:bg-yellow-900/20 text-xs gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {issueCount} issue{issueCount !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-3 space-y-3">
          {/* Integrity */}
          {showIntegrity && issueCount > 0 && (
            <div className="p-3 bg-yellow-900/10 border border-yellow-600/30 rounded-lg space-y-2">
              <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wide">Data Integrity</p>
              {integrity.safe.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Safe to Normalize</p>
                  {integrity.safe.map((i, idx) => <p key={idx} className="text-xs text-gray-300">{i.message}</p>)}
                </div>
              )}
              {integrity.review.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Requires Review</p>
                  {integrity.review.map((i, idx) => <p key={idx} className="text-xs text-yellow-300">⚠ {i.message}</p>)}
                </div>
              )}
            </div>
          )}

          {/* View toggle + filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-800 rounded-md p-0.5">
              <button onClick={() => setViewMode('project')}
                className={cn("px-3 py-1 text-xs rounded-md transition-colors", viewMode === 'project' ? "bg-red-600 text-white" : "text-gray-400 hover:text-white")}>
                <FolderKanban className="w-3.5 h-3.5 inline mr-1" />Project
              </button>
              <button onClick={() => setViewMode('client')}
                className={cn("px-3 py-1 text-xs rounded-md transition-colors", viewMode === 'client' ? "bg-red-600 text-white" : "text-gray-400 hover:text-white")}>
                <Users className="w-3.5 h-3.5 inline mr-1" />Client
              </button>
            </div>

            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
                className="pl-7 h-8 text-xs bg-gray-800 border-gray-700 text-white" />
            </div>

            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="h-8 w-[110px] text-xs bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="approver">Approver</SelectItem>
                <SelectItem value="commenter">Commenter</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>

            {viewMode === 'project' && (
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-[120px] text-xs bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {projectStatuses.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer shrink-0">
              <Checkbox checked={showCompleted} onCheckedChange={setShowCompleted} className="h-3.5 w-3.5" />
              Completed
            </label>
          </div>

          {/* Project View */}
          {viewMode === 'project' && (
            <div className="space-y-0.5 max-h-[calc(100vh-22rem)] overflow-y-auto">
              {projectViewData.length === 0 ? (
                <p className="text-center py-8 text-gray-500 text-sm">No projects match filters.</p>
              ) : projectViewData.map(({ project, records }) => {
                const status = statusMap.get(project.status_id);
                const pType = projectTypes.find(t => t.id === project.project_type_id);
                return (
                  <div key={project.id} className="px-3 py-2 hover:bg-gray-800/40 rounded-lg transition-colors group">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm text-white font-medium truncate max-w-[300px]">{project.name}</span>
                      {pType && <span className="text-[10px] text-gray-500 uppercase">{pType.name}</span>}
                      {status && <Badge style={{ backgroundColor: status.color }} className="text-white text-[10px] px-1.5 py-0">{status.label}</Badge>}
                      <Button size="icon" variant="ghost"
                        className="h-6 w-6 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 ml-auto shrink-0"
                        onClick={() => setEditProject(project)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 ml-0.5">
                      {records.map(r => {
                        const client = clientMap.get(r.client_contact_id);
                        if (!client) return null;
                        return (
                          <div key={r.id} className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-300">{client.name}</span>
                            <Badge className={cn("text-[10px] px-1 py-0 capitalize",
                              r.access_role === 'approver' ? "bg-blue-500/20 text-blue-400 border-blue-500/50 border" :
                              r.access_role === 'commenter' ? "bg-green-500/20 text-green-400 border-green-500/50 border" :
                              "bg-gray-500/20 text-gray-400 border-gray-500/50 border"
                            )}>{r.access_role}</Badge>
                            <CommPrefsInline client={client} />
                            {r.last_viewed_at && (
                              <span className="text-[10px] text-gray-500">viewed {format(new Date(r.last_viewed_at), 'MMM d')}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Client View */}
          {viewMode === 'client' && (
            <div className="max-h-[calc(100vh-22rem)] overflow-y-auto space-y-2">
              {clientViewData.length === 0 ? (
                <p className="text-center py-8 text-gray-500 text-sm">No clients match filters.</p>
              ) : clientViewData.map(({ client, records }) => (
                <ClientViewRow key={client.id} client={client} records={records} projectMap={projectMap}
                  statusMap={statusMap} projectTypes={projectTypes} onEditProject={setEditProject} toast={toast} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editProject && (
        <ProjectAccessDrawer
          project={editProject}
          allAccess={accessRecords}
          allClients={allClients}
          statuses={projectStatuses}
          onClose={() => setEditProject(null)}
        />
      )}
    </>
  );
}

// ── Client view expandable row ──
function ClientViewRow({ client, records, projectMap, statusMap, projectTypes, onEditProject, toast }) {
  const [expanded, setExpanded] = useState(true);
  const url = client.url_slug ? buildPublicClientUrl({ type: 'portal', slug: client.url_slug }) : null;

  return (
    <div className="rounded-lg border border-gray-800/50">
      <button onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-800/40 transition-colors">
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        <span className="text-sm text-white font-medium">{client.name}</span>
        <span className="text-xs text-gray-400">{client.email}</span>
        <CommPrefsInline client={client} />
        {url && (
          <button className="text-gray-500 hover:text-white ml-1" onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(url);
            toast({ description: 'Portal URL copied' });
          }}>
            <Copy className="w-3 h-3" />
          </button>
        )}
        <Badge className="bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0 ml-auto">{records.length}</Badge>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-0.5">
          {records.map(r => {
            const p = projectMap.get(r.project_id);
            if (!p) return null;
            const status = statusMap.get(p.status_id);
            const pType = projectTypes.find(t => t.id === p.project_type_id);
            return (
              <div key={r.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800/40 rounded group cursor-pointer"
                onClick={() => onEditProject(p)}>
                <span className="text-xs text-gray-300 truncate flex-1">{p.name}</span>
                {pType && <span className="text-[10px] text-gray-500">{pType.name}</span>}
                <Badge className={cn("text-[10px] px-1 py-0 capitalize",
                  r.access_role === 'approver' ? "bg-blue-500/20 text-blue-400 border-blue-500/50 border" :
                  "bg-gray-500/20 text-gray-400 border-gray-500/50 border"
                )}>{r.access_role}</Badge>
                {status && <Badge style={{ backgroundColor: status.color }} className="text-white text-[10px] px-1.5 py-0">{status.label}</Badge>}
                {r.last_viewed_at && <span className="text-[10px] text-gray-500">viewed {format(new Date(r.last_viewed_at), 'MMM d')}</span>}
                <Edit2 className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}