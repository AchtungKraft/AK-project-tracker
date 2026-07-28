import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen, Plus, Camera } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const DISCOVERY_STYLES = {
  observation: "bg-blue-600/20 text-blue-400",
  deviation: "bg-amber-600/20 text-amber-400",
  issue: "bg-red-600/20 text-red-400",
  improvement: "bg-green-600/20 text-green-400",
  tip: "bg-yellow-600/20 text-yellow-400",
};

export default function KnowledgeProjectNotes({ knowledgeItemId }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newType, setNewType] = useState("observation");
  const [selectedProject, setSelectedProject] = useState("");

  const { data: notes = [] } = useQuery({
    queryKey: ['knowledgeProjectNotes', knowledgeItemId],
    queryFn: () => base44.entities.BuildKnowledgeProjectNote.filter({ knowledge_item_id: knowledgeItemId }),
    enabled: !!knowledgeItemId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 60000,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
    staleTime: 60000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BuildKnowledgeProjectNote.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledgeProjectNotes', knowledgeItemId] });
      setShowAdd(false);
      setNewNote("");
      setSelectedProject("");
      toast({ title: "Note added" });
    },
  });

  const handleSubmit = () => {
    if (!newNote.trim() || !selectedProject) return;
    createMutation.mutate({
      knowledge_item_id: knowledgeItemId,
      project_id: selectedProject,
      note: newNote.trim(),
      discovery_type: newType,
    });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5" /> Project Notes ({notes.length})
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)} className="text-gray-400 hover:text-white gap-1 h-6 text-xs">
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>

      {showAdd && (
        <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700 mb-3 space-y-2">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="bg-gray-900 border-gray-700 text-white h-9 text-sm">
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent>
              {projects.filter(p => !p.is_system_project).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white h-9 text-sm w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="observation">Observation</SelectItem>
                <SelectItem value="deviation">Deviation</SelectItem>
                <SelectItem value="issue">Issue</SelectItem>
                <SelectItem value="improvement">Improvement</SelectItem>
                <SelectItem value="tip">Tip</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="What did you discover on this specific car?"
            className="bg-gray-900 border-gray-700 text-white min-h-[60px] text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="text-gray-400 h-8">Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!newNote.trim() || !selectedProject || createMutation.isPending} className="bg-red-600 hover:bg-red-700 h-8">
              Save Note
            </Button>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-2">
          {notes.map(note => {
            const project = projects.find(p => p.id === note.project_id);
            const tech = teamMembers.find(t => t.id === note.technician_id);
            return (
              <div key={note.id} className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-300">{project?.name || 'Unknown Project'}</span>
                  <Badge className={cn("text-[10px]", DISCOVERY_STYLES[note.discovery_type] || DISCOVERY_STYLES.observation)}>
                    {note.discovery_type}
                  </Badge>
                </div>
                <p className="text-sm text-gray-200">{note.note}</p>
                {note.photos?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {note.photos.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-16 h-16 rounded object-cover bg-gray-800" />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                  {tech && <span>{tech.full_name}</span>}
                  {note.created_date && <span>{format(new Date(note.created_date), 'MMM d, yyyy')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}