import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function CreatePageModal({ projectId, accesses, contacts, onClose, onCreated }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState('update');
  const [visibility, setVisibility] = useState('portal');
  const [clientContactId, setClientContactId] = useState('');

  // Auto-select first client if only one
  const projectContacts = useMemo(() => {
    const contactIds = accesses.map(a => a.client_contact_id);
    return contacts.filter(c => contactIds.includes(c.id));
  }, [accesses, contacts]);

  const selectedContact = clientContactId || (projectContacts.length === 1 ? projectContacts[0]?.id : '');

  const createMutation = useMutation({
    mutationFn: async () => {
      const pageSlug = slugify(title);
      const page = await base44.entities.ClientPage.create({
        title,
        project_id: projectId,
        client_contact_id: selectedContact,
        page_slug: pageSlug,
        purpose,
        visibility,
        short_description: description,
        status: 'draft'
      });
      return page;
    },
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ['clientPages', projectId] });
      onCreated(page.id);
    },
  });

  const canCreate = title.trim() && selectedContact;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Create Client Page</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-gray-400">Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Woven Leather Options"
              className="bg-gray-800 border-gray-700 text-white mt-1" />
            {title && (
              <p className="text-[11px] text-gray-500 mt-1">Slug: {slugify(title)}</p>
            )}
          </div>

          <div>
            <Label className="text-gray-400">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Brief description for the client"
              className="bg-gray-800 border-gray-700 text-white mt-1 h-16" />
          </div>

          {projectContacts.length > 1 && (
            <div>
              <Label className="text-gray-400">Client</Label>
              <Select value={selectedContact} onValueChange={setClientContactId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {projectContacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400">Purpose</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="resources">Resources</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portal">Portal Only</SelectItem>
                  <SelectItem value="public_link">Public Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300">
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()}
            disabled={!canCreate || createMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white">
            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Create Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}