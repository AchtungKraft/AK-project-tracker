import React, { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function TipForm({ knowledgeItemId, onClose, onSuccess }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const item = await base44.entities.BuildKnowledgeItem.list();
      const target = item.find(i => i.id === knowledgeItemId);
      if (!target) return;
      const tips = [...(target.tips || []), { id: crypto.randomUUID(), text, source }];
      await base44.entities.BuildKnowledgeItem.update(knowledgeItemId, { tips });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
      toast.success("Tip added");
      onSuccess();
    },
  });

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Add Tip</DialogTitle></DialogHeader>
      <div className="space-y-3 py-3">
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Share a tip or trick..." className="bg-gray-800 border-gray-700 text-white min-h-[80px]" />
        <Input value={source} onChange={e => setSource(e.target.value)} placeholder="Source (optional, e.g. 'Dave — 10 years experience')" className="bg-gray-800 border-gray-700 text-white" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!text.trim() || mutation.isPending} className="bg-red-600 hover:bg-red-700">Save Tip</Button>
      </DialogFooter>
    </>
  );
}

function IssueForm({ knowledgeItemId, onClose, onSuccess }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [resolution, setResolution] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const items = await base44.entities.BuildKnowledgeItem.list();
      const target = items.find(i => i.id === knowledgeItemId);
      if (!target) return;
      const known_issues = [...(target.known_issues || []), { id: crypto.randomUUID(), title, description, severity, resolution }];
      await base44.entities.BuildKnowledgeItem.update(knowledgeItemId, { known_issues });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
      toast.success("Issue added");
      onSuccess();
    },
  });

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Add Known Issue</DialogTitle></DialogHeader>
      <div className="space-y-3 py-3">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Issue title..." className="bg-gray-800 border-gray-700 text-white" />
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue..." className="bg-gray-800 border-gray-700 text-white min-h-[60px]" />
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Known resolution (optional)..." className="bg-gray-800 border-gray-700 text-white min-h-[40px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending} className="bg-red-600 hover:bg-red-700">Save Issue</Button>
      </DialogFooter>
    </>
  );
}

function WarningForm({ knowledgeItemId, onClose, onSuccess }) {
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState("warning");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const items = await base44.entities.BuildKnowledgeItem.list();
      const target = items.find(i => i.id === knowledgeItemId);
      if (!target) return;
      const warnings = [...(target.warnings || []), { id: crypto.randomUUID(), text, severity }];
      await base44.entities.BuildKnowledgeItem.update(knowledgeItemId, { warnings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
      toast.success("Warning added");
      onSuccess();
    },
  });

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Add Warning</DialogTitle></DialogHeader>
      <div className="space-y-3 py-3">
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Describe the safety or procedural warning..." className="bg-gray-800 border-gray-700 text-white min-h-[80px]" />
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="caution">Caution</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="danger">Danger</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!text.trim() || mutation.isPending} className="bg-red-600 hover:bg-red-700">Save Warning</Button>
      </DialogFooter>
    </>
  );
}

function ObservationForm({ knowledgeItemId, onClose, onSuccess }) {
  const [note, setNote] = useState("");
  const [discoveryType, setDiscoveryType] = useState("observation");
  const [selectedProject, setSelectedProject] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.Project.list(), staleTime: 60000,
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setPhotos(prev => [...prev, ...urls]);
    setUploading(false);
  };

  const mutation = useMutation({
    mutationFn: () => base44.entities.BuildKnowledgeProjectNote.create({
      knowledge_item_id: knowledgeItemId, project_id: selectedProject,
      note, discovery_type: discoveryType, photos,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledgeProjectNotes', knowledgeItemId] });
      toast.success("Observation added");
      onSuccess();
    },
  });

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Add Project Observation</DialogTitle></DialogHeader>
      <div className="space-y-3 py-3">
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Select project..." /></SelectTrigger>
          <SelectContent>{projects.filter(p => !p.is_system_project).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={discoveryType} onValueChange={setDiscoveryType}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="observation">Observation</SelectItem>
            <SelectItem value="deviation">Deviation</SelectItem>
            <SelectItem value="issue">Issue</SelectItem>
            <SelectItem value="improvement">Improvement</SelectItem>
            <SelectItem value="tip">Tip</SelectItem>
          </SelectContent>
        </Select>
        <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="What did you discover on this specific car?" className="bg-gray-800 border-gray-700 text-white min-h-[80px]" />
        <div>
          <label className="block text-xs text-gray-400 mb-1">Photos</label>
          <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="text-xs text-gray-400" />
          {photos.length > 0 && (
            <div className="flex gap-1 mt-2">{photos.map((url, i) => <img key={i} src={url} alt="" className="w-14 h-14 rounded object-cover bg-gray-800" />)}</div>
          )}
          {uploading && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!note.trim() || !selectedProject || mutation.isPending} className="bg-red-600 hover:bg-red-700">Save Observation</Button>
      </DialogFooter>
    </>
  );
}

function MediaForm({ knowledgeItemId, onClose, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploading(true);
    const items = await base44.entities.BuildKnowledgeItem.list();
    const target = items.find(i => i.id === knowledgeItemId);
    if (!target) { setUploading(false); return; }
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    const media_urls = [...(target.media_urls || []), ...urls];
    await base44.entities.BuildKnowledgeItem.update(knowledgeItemId, { media_urls });
    queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
    toast.success(`${urls.length} media file(s) added`);
    setUploading(false);
    onSuccess();
  };

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Add Media</DialogTitle></DialogHeader>
      <div className="py-6 text-center">
        <input type="file" multiple accept="image/*,video/*" onChange={handleUpload} className="text-sm text-gray-400" />
        {uploading && <p className="text-xs text-gray-500 mt-3">Uploading media...</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
      </DialogFooter>
    </>
  );
}

function PdfForm({ knowledgeItemId, onClose, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const items = await base44.entities.BuildKnowledgeItem.list();
    const target = items.find(i => i.id === knowledgeItemId);
    if (!target) { setUploading(false); return; }
    const attachments = [...(target.attachments || []), { id: crypto.randomUUID(), name: name || file.name, url: file_url, type: 'pdf' }];
    await base44.entities.BuildKnowledgeItem.update(knowledgeItemId, { attachments });
    queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
    toast.success("PDF attached");
    setUploading(false);
    onSuccess();
  };

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Attach PDF</DialogTitle></DialogHeader>
      <div className="space-y-3 py-3">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Document name (optional)" className="bg-gray-800 border-gray-700 text-white" />
        <input type="file" accept=".pdf" onChange={handleUpload} className="text-sm text-gray-400" />
        {uploading && <p className="text-xs text-gray-500 mt-2">Uploading...</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
      </DialogFooter>
    </>
  );
}

function PartLinkForm({ knowledgeItemId, onClose, onSuccess }) {
  const [selectedPartId, setSelectedPartId] = useState("");
  const [requirement, setRequirement] = useState("required");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const { data: parts = [] } = useQuery({ queryKey: ['parts'], queryFn: () => base44.entities.Part.list(), staleTime: 60000 });

  const mutation = useMutation({
    mutationFn: () => base44.entities.BuildKnowledgePartLink.create({
      knowledge_item_id: knowledgeItemId, part_id: selectedPartId,
      requirement, estimated_qty: qty ? Number(qty) : undefined, install_notes: notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledgePartLinks', knowledgeItemId] });
      toast.success("Part linked");
      onSuccess();
    },
  });

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Link Part</DialogTitle></DialogHeader>
      <div className="space-y-3 py-3">
        <Select value={selectedPartId} onValueChange={setSelectedPartId}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Select part..." /></SelectTrigger>
          <SelectContent>{parts.map(p => <SelectItem key={p.id} value={p.id}>{p.part_name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={requirement} onValueChange={setRequirement}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
              <SelectItem value="conditional">Conditional</SelectItem>
            </SelectContent>
          </Select>
          <Input value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty" type="number" className="bg-gray-800 border-gray-700 text-white w-20" />
        </div>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Install notes (optional)" className="bg-gray-800 border-gray-700 text-white" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!selectedPartId || mutation.isPending} className="bg-red-600 hover:bg-red-700">Link Part</Button>
      </DialogFooter>
    </>
  );
}

function LinkForm({ knowledgeItemId, onClose, onSuccess }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const items = await base44.entities.BuildKnowledgeItem.list();
      const target = items.find(i => i.id === knowledgeItemId);
      if (!target) return;
      const blocks = [...(target.content_blocks || [])];
      blocks.push({ id: crypto.randomUUID(), type: 'link', order: blocks.length, data: { url, title: title || url, description } });
      await base44.entities.BuildKnowledgeItem.update(knowledgeItemId, { content_blocks: blocks });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildKnowledgeItems'] });
      toast.success("Link added");
      onSuccess();
    },
  });

  return (
    <>
      <DialogHeader><DialogTitle className="text-white">Add Reference Link</DialogTitle></DialogHeader>
      <div className="space-y-3 py-3">
        <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="bg-gray-800 border-gray-700 text-white" />
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Link title (optional)" className="bg-gray-800 border-gray-700 text-white" />
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="bg-gray-800 border-gray-700 text-white" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} className="border-gray-700">Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!url.trim() || mutation.isPending} className="bg-red-600 hover:bg-red-700">Save Link</Button>
      </DialogFooter>
    </>
  );
}

const FORMS = {
  tip: TipForm, issue: IssueForm, warning: WarningForm, observation: ObservationForm,
  media: MediaForm, pdf: PdfForm, part: PartLinkForm, link: LinkForm,
};

export default function InlineContributionModal({ actionType, knowledgeItemId, onClose, onSuccess }) {
  const FormComponent = FORMS[actionType];
  if (!FormComponent) return null;

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white sm:max-w-lg">
        <FormComponent knowledgeItemId={knowledgeItemId} onClose={onClose} onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}