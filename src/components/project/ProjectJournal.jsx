import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, Loader2, Calendar, X, Paperclip, Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { toast } from "sonner";
import JournalEntryDetailModal from "../journal/JournalEntryDetailModal";
import ImageModal from "../ui/ImageModal";

export default function ProjectJournal({ projectId }) {
  const queryClient = useQueryClient();
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [newEntry, setNewEntry] = useState({
    content: "",
    photos: [],
    url: "",
    attachments: [],
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journalEntries', projectId],
    queryFn: () => base44.entities.JournalEntry.filter({ project_id: projectId }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.JournalEntry.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries', projectId] }); // Invalidate specific project's entries
      setNewEntry({ content: "", photos: [], url: "", attachments: [] });
      setShowAddEntry(false);
      toast.success('Journal entry added');
    },
    onError: (error) => {
      console.error("Failed to add journal entry:", error);
      toast.error('Failed to add journal entry');
    },
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(file => 
        base44.integrations.Core.UploadFile({ file })
      );

      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map(r => r.file_url);
      
      setNewEntry(prev => ({
        ...prev,
        photos: [...prev.photos, ...photoUrls]
      }));
    } catch (error) {
      console.error("Error uploading photos:", error);
      toast.error("Failed to upload photos.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveNewEntryPhoto = (urlToRemove) => {
    setNewEntry(prev => ({
      ...prev,
      photos: prev.photos.filter(url => url !== urlToRemove)
    }));
  };

  const handleAttachmentUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAttachment(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newAttachment = {
        name: file.name,
        url: file_url,
        uploaded_date: new Date().toISOString()
      };
      setNewEntry(prev => ({
        ...prev,
        attachments: [...prev.attachments, newAttachment]
      }));
      toast.success('Document uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload document');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveNewEntryAttachment = (attachmentUrl) => {
    setNewEntry(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a.url !== attachmentUrl)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newEntry.content.trim()) {
      toast.error("Journal entry cannot be empty.");
      return;
    }

    createMutation.mutate({
      project_id: projectId,
      content: newEntry.content,
      photos: newEntry.photos,
      url: newEntry.url,
      attachments: newEntry.attachments,
      entry_date: new Date().toISOString(),
    });
  };

  const sortedEntries = [...entries].sort((a, b) => 
    new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date)
  );

  const handleEntryClick = (entry) => {
    setSelectedEntry(entry);
  };

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
              <div>
                <Label className="text-gray-400">Entry Content</Label>
                <Textarea
                  value={newEntry.content}
                  onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                  placeholder="What happened today?"
                  className="bg-gray-800 border-gray-700 text-white min-h-[150px]"
                  required
                />
              </div>

              <div>
                <Label className="text-gray-400">URL (Optional)</Label>
                <Input
                  value={newEntry.url}
                  onChange={(e) => setNewEntry({ ...newEntry, url: e.target.value })}
                  placeholder="https://example.com"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              
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
                <input
                  type="file"
                  id="attachment-upload"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
                <label htmlFor="attachment-upload">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer border-gray-700"
                    disabled={uploadingAttachment}
                    onClick={() => document.getElementById('attachment-upload').click()}
                  >
                    {uploadingAttachment ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Paperclip className="mr-2 h-4 w-4" />
                        Add Document ({newEntry.attachments.length})
                      </>
                    )}
                  </Button>
                </label>
                <Button 
                  type="submit" 
                  className="bg-red-600 hover:bg-red-700"
                  disabled={createMutation.isPending || !newEntry.content.trim()}
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
                <div>
                  <Label className="text-gray-400">Photos ({newEntry.photos.length})</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-2">
                    {newEntry.photos.map((url, idx) => (
                      <div key={idx} className="relative group">
                        <div className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden">
                          <img
                            src={url}
                            alt={`Upload ${idx + 1}`}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveNewEntryPhoto(url)}
                          className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          aria-label="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {newEntry.attachments.length > 0 && (
                <div>
                  <Label className="text-gray-400">Documents ({newEntry.attachments.length})</Label>
                  <div className="space-y-2 mt-2">
                    {newEntry.attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        <span className="text-white text-sm truncate">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveNewEntryAttachment(att.url)}
                          className="text-red-400 hover:text-red-300 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedEntries.map(entry => (
                <div
                  key={entry.id}
                  className="p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors cursor-pointer border border-gray-800"
                  onClick={() => handleEntryClick(entry)}
                >
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(entry.entry_date || entry.created_date), 'MMM d, yyyy')}
                  </div>
                  <p className="text-white text-sm line-clamp-3 mb-3">{entry.content}</p>
                  
                  {entry.photos && entry.photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-1 mb-3">
                      {entry.photos.slice(0, 3).map((url, idx) => (
                        <div 
                          key={idx}
                          className="w-full h-16 bg-gray-800 rounded border border-gray-700 flex items-center justify-center overflow-hidden hover:border-red-500 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImage(url);
                          }}
                        >
                          <img
                            src={url}
                            alt={`Photo ${idx + 1}`}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 mb-2 truncate"
                    >
                      <Link2 className="w-3 h-3 flex-shrink-0" />
                      {entry.url}
                    </a>
                  )}

                  {entry.attachments && entry.attachments.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Paperclip className="w-3 h-3" />
                      {entry.attachments.length} document{entry.attachments.length !== 1 ? 's' : ''}
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

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}