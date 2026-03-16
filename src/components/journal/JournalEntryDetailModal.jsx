import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Upload, X, Paperclip, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import ImageModal from "../ui/ImageModal";
import JournalRichEditor from "./JournalRichEditor";
import JournalLinksEditor from "./JournalLinksEditor";
import { sanitizeJournalHtml, normalizeJournalEntry, generateLinkId } from "./journalSanitizer";
import { JournalProseStyles } from "./JournalContentRenderer";

export default function JournalEntryDetailModal({ entry, onClose, projectId }) {
  const queryClient = useQueryClient();
  const [headline, setHeadline] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [photos, setPhotos] = useState([]);
  const [links, setLinks] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [visibility, setVisibility] = useState("internal");
  const [uploading, setUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    if (entry) {
      const normalized = normalizeJournalEntry(entry);
      setHeadline(entry.headline || "");
      
      // Load content_html if available, otherwise convert legacy content
      if (entry.content_html) {
        setContentHtml(entry.content_html);
      } else if (entry.content) {
        // Convert legacy plain text to basic HTML for editing
        const escaped = entry.content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        setContentHtml(escaped.split('\n').map(line => `<p>${line || '<br>'}</p>`).join(''));
      } else {
        setContentHtml("");
      }
      
      setPhotos(normalized.photos);
      setLinks(normalized.links);
      setAttachments(normalized.attachments);
      setVisibility(entry.visibility || "internal");
    }
  }, [entry]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.JournalEntry.update(entry.id, data),
    onSuccess: async (updatedEntry, variables) => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      
      const nowClient = variables.visibility === 'client';
      if (nowClient) {
        try {
          await base44.functions.invoke('sendJournalEntryEmail', { journalEntryId: entry.id });
          toast.success('Journal entry updated and clients notified');
        } catch (emailError) {
          console.error("Failed to send journal email:", emailError);
          toast.success('Journal entry updated (email notification failed)');
        }
      } else {
        toast.success('Journal entry updated successfully');
      }
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
      setAttachments([...attachments, newAttachment]);
      toast.success('Document uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload document');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = (attachmentUrl) => {
    setAttachments(attachments.filter(a => a.url !== attachmentUrl));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const sanitizedHtml = sanitizeJournalHtml(contentHtml);
    const plainText = contentHtml?.replace(/<[^>]*>/g, '').trim() || '';

    updateMutation.mutate({
      headline,
      content_html: sanitizedHtml,
      content: plainText, // Keep legacy field updated for backward compat
      url: '', // Clear deprecated legacy url field on resave
      photos,
      links: links.filter(l => l.url?.trim()),
      attachments,
      visibility,
      project_id: entry.project_id,
    });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this journal entry?')) {
      deleteMutation.mutate();
    }
  };

  return (
    <>
      <JournalProseStyles />
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Journal Entry - {entry?.entry_date ? format(new Date(entry.entry_date), 'PPP') : 'Details'}
            </DialogTitle>
            <DialogDescription>
              Edit or delete this journal entry.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label>Headline</Label>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Entry headline..."
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <Label>Entry Content</Label>
              <JournalRichEditor
                value={contentHtml}
                onChange={setContentHtml}
                placeholder="What happened today? Drop images here..."
              />
            </div>

            {/* Structured Links */}
            <JournalLinksEditor
              links={links}
              onChange={setLinks}
            />

            <div>
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-48 mt-1">
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

            <div>
              <Label>Gallery Photos</Label>
              <div className="mt-2">
                <input
                  type="file"
                  id="detail-photo-upload"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer border-gray-700"
                  disabled={uploading}
                  onClick={() => document.getElementById('detail-photo-upload').click()}
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
              </div>

              {photos.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {photos.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <div 
                        className="w-full h-32 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-red-500 transition-colors"
                        onClick={() => setSelectedImage(url)}
                      >
                        <img
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto(url);
                        }}
                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Document Attachments</Label>
              <div className="mt-2">
                <input
                  type="file"
                  id="detail-attachment-upload"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer border-gray-700"
                  disabled={uploadingAttachment}
                  onClick={() => document.getElementById('detail-attachment-upload').click()}
                >
                  {uploadingAttachment ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Paperclip className="mr-2 h-4 w-4" />
                      Add Document
                    </>
                  )}
                </Button>
              </div>

              {attachments.length > 0 && (
                <div className="space-y-2 mt-4">
                  {attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white hover:text-red-400 transition-colors text-sm truncate block"
                        >
                          {att.name}
                        </a>
                        {att.uploaded_date && (
                          <p className="text-xs text-gray-500">
                            {format(new Date(att.uploaded_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.url)}
                        className="text-red-400 hover:text-red-300 p-1 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
              <div className="flex justify-between">
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
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}