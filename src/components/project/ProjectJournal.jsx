import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, Loader2, Calendar, X, Paperclip, Link2, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import JournalEntryDetailModal from "../journal/JournalEntryDetailModal";
import ImageModal from "../ui/ImageModal";

export default function ProjectJournal({ projectId }) {
  const queryClient = useQueryClient();
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [newEntry, setNewEntry] = useState({
    headline: "",
    content: "",
    photos: [],
    url: "",
    attachments: [],
    visibility: "internal",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journalEntries', projectId],
    queryFn: () => base44.entities.JournalEntry.filter({ project_id: projectId }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.JournalEntry.create(data),
    onSuccess: async (createdEntry) => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries', projectId] });
      
      // Send email notification if visibility is client
      if (createdEntry.visibility === 'client') {
        try {
          await base44.functions.invoke('sendJournalEntryEmail', { journalEntryId: createdEntry.id });
          toast.success('Journal entry added and clients notified');
        } catch (emailError) {
          console.error("Failed to send journal email:", emailError);
          toast.success('Journal entry added (email notification failed)');
        }
      } else {
        toast.success('Journal entry added');
      }
      
      setNewEntry({ headline: "", content: "", photos: [], url: "", attachments: [], visibility: "internal" });
      setShowAddEntry(false);
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
            headline: newEntry.headline,
            content: newEntry.content,
            photos: newEntry.photos,
            url: newEntry.url,
            attachments: newEntry.attachments,
            visibility: newEntry.visibility,
            entry_date: new Date().toISOString(),
          });
  };

  const sortedEntries = [...entries].sort((a, b) => 
    new Date(b.updated_date || b.entry_date || b.created_date) - new Date(a.updated_date || a.entry_date || a.created_date)
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
                <Label className="text-gray-400">Headline</Label>
                <Input
                  value={newEntry.headline}
                  onChange={(e) => setNewEntry({ ...newEntry, headline: e.target.value })}
                  placeholder="Entry headline..."
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

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

              <div>
                <Label className="text-gray-400">Visibility</Label>
                <Select
                  value={newEntry.visibility}
                  onValueChange={(value) => setNewEntry({ ...newEntry, visibility: value })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">
                      <span className="flex items-center gap-2">
                        <EyeOff className="w-4 h-4" /> Internal Only
                      </span>
                    </SelectItem>
                    <SelectItem value="client">
                      <span className="flex items-center gap-2">
                        <Eye className="w-4 h-4" /> Visible to Client
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
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
            <div className="space-y-6">
              {sortedEntries.map(entry => (
                <article
                  key={entry.id}
                  className="p-4 bg-gray-900/50 rounded-xl border border-gray-800 hover:border-red-900/50 transition-colors cursor-pointer"
                  onClick={() => handleEntryClick(entry)}
                >
                  {/* Header with visibility badge */}
                  <div className="flex items-center justify-end mb-2">
                    <Badge className={entry.visibility === 'client' 
                      ? 'bg-green-500/20 text-green-400 border-green-500/50' 
                      : 'bg-gray-500/20 text-gray-400 border-gray-500/50'
                    }>
                      {entry.visibility === 'client' ? (
                        <><Eye className="w-3 h-3 mr-1" /> Client Visible</>
                      ) : (
                        <><EyeOff className="w-3 h-3 mr-1" /> Internal</>
                      )}
                    </Badge>
                  </div>

                  {/* Headline */}
                  {entry.headline && (
                    <h2 className="text-2xl font-bold text-white mb-1">{entry.headline}</h2>
                  )}

                  {/* Date under headline */}
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                    <Calendar className="w-4 h-4" />
                    <span>{format(new Date(entry.entry_date || entry.created_date), 'MMMM d, yyyy')}</span>
                    {entry.updated_date && entry.updated_date !== entry.created_date && (
                      <span className="text-xs text-gray-500">(Updated {format(new Date(entry.updated_date), 'MMM d, yyyy')})</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="prose prose-invert max-w-none mb-4">
                    <p className="text-gray-200 text-base leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                  </div>

                  {/* Photos Grid - 2 columns */}
                  {entry.photos && entry.photos.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {entry.photos.map((url, idx) => (
                        <div 
                          key={idx}
                          className="relative aspect-video bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden hover:border-red-500 transition-colors group"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGalleryImages(entry.photos);
                            setGalleryIndex(idx);
                            setSelectedImage(url);
                          }}
                        >
                          <img
                            src={url}
                            alt={`Photo ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* URL Link */}
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 mb-2 px-2 py-1.5 bg-gray-800/50 rounded-lg"
                    >
                      <Link2 className="w-4 h-4 flex-shrink-0" />
                      {entry.url}
                    </a>
                  )}

                  {/* Attachments */}
                  {entry.attachments && entry.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-800">
                      {entry.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white px-3 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <Paperclip className="w-4 h-4" />
                          {att.name}
                        </a>
                      ))}
                    </div>
                  )}
                </article>
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
        onClose={() => {
          setSelectedImage(null);
          setGalleryImages([]);
          setGalleryIndex(0);
        }}
        imageUrl={selectedImage}
        images={galleryImages}
        currentIndex={galleryIndex}
        onNavigate={(newIndex) => {
          setGalleryIndex(newIndex);
          setSelectedImage(galleryImages[newIndex]);
        }}
      />
    </>
  );
}