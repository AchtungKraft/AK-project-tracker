import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload, X, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ImageModal from "../ui/ImageModal";

export default function PartJournalSection({ partId }) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [newEntry, setNewEntry] = useState({
    content: '',
    url: '',
    photos: []
  });

  // PERF FIX: Add caching to prevent refetch storms
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['partJournalEntries', partId],
    queryFn: () => base44.entities.PartJournalEntry.filter({ part_id: partId }),
    enabled: !!partId,
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PartJournalEntry.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partJournalEntries', partId] });
      setNewEntry({ content: '', url: '', photos: [] });
      setShowAddForm(false);
      toast.success('Entry added');
    },
  });

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(file => 
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const photoUrls = results.map(r => r.file_url);
      
      setNewEntry({
        ...newEntry,
        photos: [...newEntry.photos, ...photoUrls]
      });
      toast.success(`${files.length} photo(s) uploaded`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    setNewEntry({
      ...newEntry,
      photos: newEntry.photos.filter(url => url !== urlToRemove)
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newEntry.content.trim()) {
      toast.error('Entry content is required');
      return;
    }

    createMutation.mutate({
      part_id: partId,
      content: newEntry.content,
      url: newEntry.url || undefined,
      photos: newEntry.photos,
      entry_date: new Date().toISOString()
    });
  };

  const sortedEntries = [...entries].sort((a, b) => 
    new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date)
  );

  return (
    <div className="space-y-4">
      {!showAddForm && (
        <Button
          onClick={() => setShowAddForm(true)}
          className="bg-red-600 hover:bg-red-700 gap-2"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          Add Journal Entry
        </Button>
      )}

      {showAddForm && (
        <Card className="bg-gray-900/50 border border-red-900/30">
          <CardHeader className="border-b border-red-900/30 p-4">
            <CardTitle className="text-white text-sm">New Journal Entry</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-gray-400 text-xs">Entry Content *</Label>
                <Textarea
                  value={newEntry.content}
                  onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                  placeholder="Add notes, comments, or updates about this part..."
                  className="bg-gray-800 border-gray-700 text-white"
                  rows={4}
                />
              </div>

              <div>
                <Label className="text-gray-400 text-xs">Related URL</Label>
                <Input
                  type="url"
                  value={newEntry.url}
                  onChange={(e) => setNewEntry({ ...newEntry, url: e.target.value })}
                  placeholder="https://..."
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-400 text-xs">Photos</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {newEntry.photos.map((url, idx) => (
                    <div key={idx} className="relative w-20 h-20 bg-gray-800 rounded border border-gray-700">
                      <img src={url} alt="" className="w-full h-full object-contain rounded" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(url)}
                        className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1 hover:bg-red-700"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  <label className="w-20 h-20 bg-gray-800 rounded border border-gray-700 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-gray-700">
                    {uploading ? (
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-400" />
                        <span className="text-xs text-gray-400 mt-1">Add</span>
                      </>
                    )}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewEntry({ content: '', url: '', photos: [] });
                  }}
                  className="flex-1 border-gray-700"
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={createMutation.isPending || !newEntry.content.trim()}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Entry'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Journal Entries */}
      <div className="space-y-3">
        {isLoading ? (
          <Card className="bg-gray-900/50 border border-red-900/30">
            <CardContent className="p-4">
              <div className="text-center text-gray-500 text-sm">Loading entries...</div>
            </CardContent>
          </Card>
        ) : sortedEntries.length === 0 ? (
          <Card className="bg-gray-900/50 border border-red-900/30">
            <CardContent className="p-8">
              <div className="text-center text-gray-500 text-sm">
                No journal entries yet. Add notes, photos, or updates to track changes.
              </div>
            </CardContent>
          </Card>
        ) : (
          sortedEntries.map(entry => (
            <Card key={entry.id} className="bg-gray-900/50 border border-red-900/30">
              <CardHeader className="border-b border-red-900/30 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">
                      {format(new Date(entry.entry_date || entry.created_date), 'MMM d, yyyy h:mm a')}
                    </p>
                    {entry.created_by && (
                      <p className="text-xs text-gray-500 mt-1">by {entry.created_by}</p>
                    )}
                  </div>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Link
                    </a>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3">
                <p className="text-white text-sm whitespace-pre-wrap">{entry.content}</p>
                
                {entry.photos && entry.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {entry.photos.map((photo, idx) => (
                      <div
                        key={idx}
                        className="w-24 h-24 bg-gray-800 rounded border border-gray-700 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setSelectedImage(photo)}
                      >
                        <img
                          src={photo}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {selectedImage && (
        <ImageModal
          isOpen={!!selectedImage}
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  );
}