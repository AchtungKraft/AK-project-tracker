import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Camera, Upload, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ProjectJournal({ projectId }) {
  const queryClient = useQueryClient();
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({ content: '', photos: [] });
  const [uploading, setUploading] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journalEntries', projectId],
    queryFn: () => base44.entities.JournalEntry.filter({ project_id: projectId }, '-entry_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.JournalEntry.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries', projectId] });
      toast.success('Journal entry added');
      setNewEntry({ content: '', photos: [] });
      setShowAddEntry(false);
    },
    onError: () => {
      toast.error('Failed to add entry');
    }
  });

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);

    try {
      const uploadPromises = files.map(file => 
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const urls = results.map(r => r.file_url);
      
      setNewEntry(prev => ({
        ...prev,
        photos: [...prev.photos, ...urls]
      }));
    } catch (error) {
      toast.error('Failed to upload photos');
    }
    setUploading(false);
  };

  const handleSubmit = () => {
    if (!newEntry.content.trim()) {
      toast.error('Please add some content');
      return;
    }

    createMutation.mutate({
      project_id: projectId,
      content: newEntry.content,
      photos: newEntry.photos,
      entry_date: new Date().toISOString(),
    });
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">Build Journal</CardTitle>
          <Button 
            onClick={() => setShowAddEntry(!showAddEntry)}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Entry
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {showAddEntry && (
          <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-red-900/20">
            <Textarea
              placeholder="Describe what you worked on today..."
              value={newEntry.content}
              onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
              className="bg-gray-800 border-gray-700 text-white h-32 mb-4"
            />
            
            {newEntry.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {newEntry.photos.map((url, index) => (
                  <div key={index} className="relative">
                    <img 
                      src={url} 
                      alt={`Upload ${index + 1}`}
                      className="w-full h-24 object-cover rounded"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 bg-black/50 hover:bg-black/70"
                      onClick={() => setNewEntry(prev => ({
                        ...prev,
                        photos: prev.photos.filter((_, i) => i !== index)
                      }))}
                    >
                      <X className="w-4 h-4 text-white" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex gap-3">
              <label className="flex-1">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <Button 
                  type="button"
                  variant="outline"
                  className="w-full border-gray-700"
                  disabled={uploading}
                  onClick={() => document.querySelector('input[type="file"][multiple]').click()}
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Add Photos</>
                  )}
                </Button>
              </label>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {createMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                ) : 'Save Entry'}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading journal...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No journal entries yet. Click "Add Entry" to document your progress.
          </div>
        ) : (
          <div className="space-y-6">
            {entries.map(entry => (
              <div 
                key={entry.id}
                className="border-l-4 border-red-600 pl-4 py-2"
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm text-gray-400">
                    {format(new Date(entry.entry_date), 'MMMM d, yyyy • h:mm a')}
                  </p>
                </div>
                <p className="text-white mb-4 whitespace-pre-wrap">{entry.content}</p>
                
                {entry.photos && entry.photos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {entry.photos.map((url, index) => (
                      <a 
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img 
                          src={url} 
                          alt={`Photo ${index + 1}`}
                          className="w-full h-32 object-cover rounded hover:opacity-90 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}