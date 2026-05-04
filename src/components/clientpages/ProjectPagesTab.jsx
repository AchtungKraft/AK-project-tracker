import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, Copy, ExternalLink, Pencil, Archive, MoreVertical, FileText, Eye, Loader2
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { toast } from "sonner";
import CreatePageModal from "./CreatePageModal";
import PageEditorDrawer from "./PageEditorDrawer";
import SharedBlockLibraryModal from "./SharedBlockLibraryModal";

const PURPOSE_LABELS = {
  proposal: 'Proposal', sales: 'Sales', update: 'Update',
  resources: 'Resources', onboarding: 'Onboarding'
};

const STATUS_STYLES = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  published: 'bg-green-500/20 text-green-400 border-green-500/40',
  archived: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
};

export default function ProjectPagesTab({ projectId }) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPageId, setEditingPageId] = useState(null);
  const [showBlockLibrary, setShowBlockLibrary] = useState(false);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['clientPages', projectId],
    queryFn: () => base44.entities.ClientPage.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 15000,
  });

  // Get client contact for link generation
  const { data: accesses = [] } = useQuery({
    queryKey: ['projectClientAccess', projectId],
    queryFn: () => base44.entities.ProjectClientAccess.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60000,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['clientContacts'],
    queryFn: () => base44.entities.ClientContact.list(),
    staleTime: 60000,
  });

  // Canonical slug field: ClientContact.url_slug
  const contactSlugMap = useMemo(() => {
    const map = {};
    contacts.forEach(c => { if (c.url_slug) map[c.id] = c.url_slug; });
    return map;
  }, [contacts]);

  const archiveMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.ClientPage.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientPages', projectId] }),
  });

  const getPageLink = (page) => {
    const slug = contactSlugMap[page.client_contact_id];
    if (!slug) return null;
    return `${window.location.origin}/clientpage?slug=${slug}&page=${page.page_slug}`;
  };

  const copyLink = (page) => {
    const link = getPageLink(page);
    if (link) {
      navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } else {
      toast.error('No client slug configured');
    }
  };

  const sortedPages = useMemo(() => {
    return [...pages].sort((a, b) => {
      const statusOrder = { published: 0, draft: 1, archived: 2 };
      const diff = (statusOrder[a.status] || 1) - (statusOrder[b.status] || 1);
      if (diff !== 0) return diff;
      return new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date);
    });
  }, [pages]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Client Pages</h3>
          <p className="text-sm text-gray-400">Create shareable pages for this project's client</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBlockLibrary(true)}
            className="border-gray-700 text-gray-300 gap-1">
            <FileText className="w-3.5 h-3.5" /> Block Library
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white gap-1">
            <Plus className="w-3.5 h-3.5" /> Create Page
          </Button>
        </div>
      </div>

      {sortedPages.length === 0 ? (
        <Card className="bg-black/40 border-gray-700">
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400">No pages yet. Create one to share with your client.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sortedPages.map(page => (
            <Card key={page.id} className="bg-black/40 border-gray-700 hover:border-gray-600 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-white truncate">{page.title}</h4>
                      <Badge className={`text-[10px] px-1.5 ${STATUS_STYLES[page.status]}`}>
                        {page.status}
                      </Badge>
                      {page.purpose && (
                        <Badge variant="outline" className="text-[10px] px-1.5 border-gray-600 text-gray-400">
                          {PURPOSE_LABELS[page.purpose] || page.purpose}
                        </Badge>
                      )}
                    </div>
                    {page.short_description && (
                      <p className="text-xs text-gray-500 line-clamp-1">{page.short_description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                      <span>/{page.page_slug}</span>
                      <span>•</span>
                      <span>{page.visibility === 'public_link' ? 'Public' : 'Portal'}</span>
                      {page.updated_date && (
                        <>
                          <span>•</span>
                          <span>Updated {format(new Date(page.updated_date), 'MMM d')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white"
                      onClick={() => copyLink(page)} title="Copy link">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white"
                      onClick={() => setEditingPageId(page.id)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-gray-900 border-gray-700">
                        {getPageLink(page) && (
                          <DropdownMenuItem onClick={() => window.open(getPageLink(page), '_blank')}
                            className="text-gray-300 gap-2">
                            <Eye className="w-4 h-4" /> Preview
                          </DropdownMenuItem>
                        )}
                        {page.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: page.id, status: 'archived' })}
                            className="text-orange-400 gap-2">
                            <Archive className="w-4 h-4" /> Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: page.id, status: 'draft' })}
                            className="text-gray-300 gap-2">
                            <FileText className="w-4 h-4" /> Restore to Draft
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreatePageModal
          projectId={projectId}
          accesses={accesses}
          contacts={contacts}
          onClose={() => setShowCreateModal(false)}
          onCreated={(pageId) => {
            setShowCreateModal(false);
            setEditingPageId(pageId);
          }}
        />
      )}

      {editingPageId && (
        <PageEditorDrawer
          pageId={editingPageId}
          onClose={() => {
            setEditingPageId(null);
            queryClient.invalidateQueries({ queryKey: ['clientPages', projectId] });
          }}
        />
      )}

      {showBlockLibrary && (
        <SharedBlockLibraryModal
          projectId={projectId}
          onClose={() => setShowBlockLibrary(false)}
        />
      )}
    </div>
  );
}