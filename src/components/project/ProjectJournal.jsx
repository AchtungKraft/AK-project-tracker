import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import JournalEntryDetailModal from "../journal/JournalEntryDetailModal";

export default function ProjectJournal({ projectId }) {
  const queryClient = useQueryClient();
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [newEntry, setNewEntry] = useState({
    content: "",
    photos: [],
  });
  const [uploading, setUploading] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journalEntries', projectId],
    queryFn: () => base44.entities.JournalEntry.filter({ project_id: projectId }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.JournalEntry.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      setNewEntry({ content: "", photos: [] });
      setShowAddEntry(false);
      toast.success('Journal entry added');
    },
    onError: () => {
      toast.error('Failed to add journal entry');
    },
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const uploadPromises = files.map(file => 
      base44.integrations.Core.UploadFile({ file })
    );

    const results = await Promise.all(uploadPromises);
    const photoUrls = results.map(r => r.file_url);
    
    setNewEntry({
      ...newEntry,
      photos: [...newEntry.photos, ...photoUrls]
    });
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newEntry.content.trim()) return;

    createMutation.mutate({
      project_id: projectId,
      content: newEntry.content,
      photos: newEntry.photos,
      entry_date: new Date().toISOString(),
    });
  };

  const sortedEntries = [...entries].sort((a, b) => 
    new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date)
  );

  const handleEntryClick = (entry) => {
    console.log('Journal entry clicked:', entry);
    setSelectedEntry(entry);
  };

  console.log('ProjectJournal render - selectedEntry:', selectedEntry);

  return (
    <>
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30">
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Build Journal</CardTitle>
            <Button
              onClick={() => setShowAddEntry(!showAddEntry)}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Plus className="w-4 h-4" />
              {showAddEntry ? 'Cancel' : 'Add Entry'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {showAddEntry && (
            <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
              <Textarea
                value={newEntry.content}
                onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                placeholder="What happened today?"
                className="bg-gray-800 border-gray-700 text-white min-h-[150px]"
                required
              />
              
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  id="photo-upload"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <label htmlFor="photo-upload">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer border-gray-700"
                    disabled={uploading}
                    onClick={() => document.getElementById('photo-upload').click()}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Add Photos ({newEntry.photos.length})
                      </>
                    )}
                  </Button>
                </label>
                <Button 
                  type="submit" 
                  className="bg-red-600 hover:bg-red-700"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Entry'
                  )}
                </Button>
              </div>

              {newEntry.photos.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {newEntry.photos.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Upload ${idx + 1}`}
                      className="w-full h-20 object-cover rounded-lg border border-gray-700"
                    />
                  ))}
                </div>
              )}
            </form>
          )}

          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading journal entries...</div>
          ) : sortedEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No journal entries yet. Add one to document your progress.
            </div>
          ) : (
            <div className="space-y-6">
              {sortedEntries.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => handleEntryClick(entry)}
                  className="p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                    <Calendar className="w-4 h-4" />
                    {format(new Date(entry.entry_date || entry.created_date), 'PPP')}
                  </div>
                  <p className="text-white whitespace-pre-wrap line-clamp-3">{entry.content}</p>
                  {entry.photos && entry.photos.length > 0 && (
                    <div className="grid grid-cols-4 md:grid-cols-6 gap-2 mt-4">
                      {entry.photos.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          className="w-full h-16 object-cover rounded-lg border border-gray-700"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEntry && (
        <JournalEntryDetailModal
          entry={selectedEntry}
          projectId={projectId}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </>
  );
}