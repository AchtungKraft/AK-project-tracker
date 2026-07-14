import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Check, X, CheckCircle2, Circle, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export default function MeetingNotesSection({ projectId, notes = [], teamMembers = [] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [decision, setDecision] = useState("");
  const [owner, setOwner] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!decision.trim()) return;
    setSaving(true);
    await base44.entities.MeetingNote.create({
      project_id: projectId,
      meeting_date: format(new Date(), "yyyy-MM-dd"),
      decision: decision.trim(),
      owner: owner.trim() || undefined,
      follow_up: followUp.trim() || undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["meetingNotes"] });
    setDecision("");
    setOwner("");
    setFollowUp("");
    setAdding(false);
    setSaving(false);
  };

  const handleResolve = async (noteId, resolved) => {
    await base44.entities.MeetingNote.update(noteId, {
      is_resolved: resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
    });
    queryClient.invalidateQueries({ queryKey: ["meetingNotes"] });
  };

  const unresolvedNotes = notes.filter(n => !n.is_resolved);
  const resolvedNotes = notes.filter(n => n.is_resolved);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Meeting Notes</span>
          {unresolvedNotes.length > 0 && (
            <span className="text-[10px] text-amber-400 tabular-nums">{unresolvedNotes.length} open</span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[10px] text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Note
          </button>
        )}
      </div>

      {/* Add note form */}
      {adding && (
        <div className="space-y-1.5 mb-3 bg-gray-800/30 rounded-md p-2.5" onClick={e => e.stopPropagation()}>
          <Input
            value={decision}
            onChange={e => setDecision(e.target.value)}
            placeholder="Decision or note..."
            className="h-7 text-xs bg-gray-900/50 border-gray-700"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Input
              value={owner}
              onChange={e => setOwner(e.target.value)}
              placeholder="Owner"
              className="h-7 text-xs bg-gray-900/50 border-gray-700 flex-1"
            />
            <Input
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              placeholder="Follow-up action"
              className="h-7 text-xs bg-gray-900/50 border-gray-700 flex-1"
            />
          </div>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-gray-400" onClick={() => setAdding(false)} disabled={saving}>
              <X className="w-3 h-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" className="h-6 text-[10px] px-2 bg-red-600 hover:bg-red-700 text-white" onClick={handleSave} disabled={saving || !decision.trim()}>
              <Check className="w-3 h-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {unresolvedNotes.length === 0 && resolvedNotes.length === 0 && !adding && (
        <p className="text-[11px] text-gray-600 italic">No meeting notes recorded.</p>
      )}

      <div className="space-y-1">
        {unresolvedNotes.map(note => {
          const d = parseDate(note.meeting_date || note.created_date);
          return (
            <div key={note.id} className="flex items-start gap-2 group/note">
              <button
                onClick={(e) => { e.stopPropagation(); handleResolve(note.id, true); }}
                className="mt-0.5 text-gray-600 hover:text-emerald-400 transition-colors shrink-0"
                title="Mark resolved"
              >
                <Circle className="w-3 h-3" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-200 leading-tight">{note.decision}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {d && <span className="text-[10px] text-gray-600 tabular-nums">{format(d, "M/d")}</span>}
                  {note.owner && <span className="text-[10px] text-blue-400">{note.owner}</span>}
                  {note.follow_up && <span className="text-[10px] text-gray-500">→ {note.follow_up}</span>}
                </div>
              </div>
            </div>
          );
        })}

        {resolvedNotes.length > 0 && (
          <ResolvedNotes notes={resolvedNotes} onUnresolve={handleResolve} />
        )}
      </div>
    </div>
  );
}

function ResolvedNotes({ notes, onUnresolve }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button onClick={() => setShow(s => !s)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
        {show ? "Hide" : "Show"} {notes.length} resolved
      </button>
      {show && notes.map(note => {
        const d = parseDate(note.meeting_date || note.created_date);
        return (
          <div key={note.id} className="flex items-start gap-2 opacity-50">
            <button
              onClick={(e) => { e.stopPropagation(); onUnresolve(note.id, false); }}
              className="mt-0.5 text-emerald-500 hover:text-gray-400 transition-colors shrink-0"
              title="Reopen"
            >
              <CheckCircle2 className="w-3 h-3" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-gray-400 leading-tight line-through">{note.decision}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {d && <span className="text-[10px] text-gray-600 tabular-nums">{format(d, "M/d")}</span>}
                {note.owner && <span className="text-[10px] text-gray-500">{note.owner}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}