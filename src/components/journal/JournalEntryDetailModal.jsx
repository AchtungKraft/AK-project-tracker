import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function JournalEntryDetailModal({ entry, onClose, projectId }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (entry) {
      setContent(entry.content || "");
      setPhotos(entry.photos || []);
    }
  }, [entry]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.JournalEntry.update(entry.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast.success('Journal entry updated successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to update journal entry');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.JournalEntry.delete(entry.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast.success('Journal entry deleted successfully');
      onClose();
    },
    onError: () => {
      toast.error('Failed to delete journal entry');
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
      const newPhotoUrls = results.map(r => r.file_url);
      setPhotos([...photos, ...newPhotoUrls]);
      toast.success('Photos uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove) => {
    setPhotos(photos.filter(url => url !== urlToRemove));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate({
      content,
      photos,
      project_id: entry.project_id,
    });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this journal entry?')) {
      deleteMutation.mutate();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Journal Entry - {entry?.entry_date ? format(new Date(entry.entry_date), 'PPP') : 'Details'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label>Entry Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What happened today?"
              className="bg-gray-800 border-gray-700 text-white min-h-[200px]"
              required
            />
          </div>

          <div>
            <Label>Photos</Label>
            <div className="mt-2">
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
                      Add Photos
                    </>
                  )}
                </Button>
              </label>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {photos.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(url)}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-gray-700">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Entry
                </>
              )}
            </Button>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-red-600 hover:bg-red-700"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}