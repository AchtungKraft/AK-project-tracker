import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquarePlus, Send, Upload, Loader2, X, Paperclip, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import JournalRichEditor from "@/components/journal/JournalRichEditor";
import JournalLinksEditor from "@/components/journal/JournalLinksEditor";
import { sanitizeJournalHtml } from "@/components/journal/journalSanitizer";

export default function FeedbackCommentComposer({
  requestId,
  projectId,
  onCommentAdded,
  isMobile = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [contentHtml, setContentHtml] = useState("");
  const [links, setLinks] = useState([]);
  const [visibility, setVisibility] = useState("client_visible");
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingImages(true);
    try {
      const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
      setUploadedPhotos(prev => [...prev, ...results.map(r => r.file_url)]);
      toast.success("Images uploaded");
      e.target.value = "";
    } catch {
      toast.error("Failed to upload images");
    } finally {
      setUploadingImages(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedFiles(prev => [...prev, { name: file.name, url: file_url }]);
      toast.success("File uploaded");
      e.target.value = "";
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploadingFile(false);
    }
  };

  const resetForm = () => {
    setContentHtml("");
    setLinks([]);
    setUploadedPhotos([]);
    setUploadedFiles([]);
    setExpanded(false);
  };

  const handleSubmit = async () => {
    const plainText = contentHtml?.replace(/<[^>]*>/g, "").trim() || "";
    const hasContent = plainText.length > 0;
    const hasLinks = links.some(l => l.url?.trim());
    const hasMedia = uploadedPhotos.length > 0 || uploadedFiles.length > 0;

    if (!hasContent && !hasLinks && !hasMedia) {
      toast.error("Please enter a comment, add a link, or attach a file");
      return;
    }

    setIsSubmitting(true);
    try {
      const sanitizedHtml = hasContent ? sanitizeJournalHtml(contentHtml) : null;
      const response = await base44.functions.invoke("addInternalComment", {
        requestId,
        content_html: sanitizedHtml,
        content_fallback: plainText,
        links: links.filter(l => l.url?.trim()),
        photos: uploadedPhotos,
        files: uploadedFiles,
        visibility,
      });

      if (response.data?.success) {
        resetForm();
        toast.success("Comment added");
        onCommentAdded?.();
      } else {
        throw new Error(response.data?.error || "Failed to add comment");
      }
    } catch (error) {
      console.error("Add comment error:", error);
      toast.error("Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <Card
        className="bg-black/40 backdrop-blur-xl border border-gray-700 cursor-pointer hover:border-gray-500 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <CardContent className={cn("flex items-center gap-3", isMobile ? "p-3" : "p-4")}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shrink-0">
            <MessageSquarePlus className="w-4 h-4 text-white" />
          </div>
          <span className="text-gray-400 text-sm flex-1">Add a comment...</span>
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-blue-500/50">
      <CardContent className={cn("space-y-3", isMobile ? "p-3" : "p-4")}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white text-sm">Add Comment</h3>
          <div className="flex items-center gap-2">
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client_visible">Client Visible</SelectItem>
                <SelectItem value="internal_only">Internal Only</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded(false)}
              className="text-gray-400 hover:text-white h-8 w-8"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* WYSIWYG Editor */}
        <JournalRichEditor
          value={contentHtml}
          onChange={setContentHtml}
          placeholder="Write a comment... Drop images here..."
        />

        {/* Structured Links */}
        <JournalLinksEditor links={links} onChange={setLinks} />

        {/* Uploaded Photos Preview */}
        {uploadedPhotos.length > 0 && (
          <div>
            <Label className="text-xs text-gray-400 mb-2 block">
              Attached Images ({uploadedPhotos.length})
            </Label>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {uploadedPhotos.map((url, idx) => (
                <div key={idx} className="relative group">
                  <div className="w-full h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden">
                    <img src={url} alt={`Upload ${idx + 1}`} loading="lazy" className="max-w-full max-h-full object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadedPhotos(prev => prev.filter(u => u !== url))}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Uploaded Files Preview */}
        {uploadedFiles.length > 0 && (
          <div>
            <Label className="text-xs text-gray-400 mb-2 block">
              Attached Files ({uploadedFiles.length})
            </Label>
            <div className="space-y-2">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
                  <span className="text-white text-sm truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setUploadedFiles(prev => prev.filter(f => f.url !== file.url))}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <input id="feedback-image-upload" type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingImages}
            className="bg-red-700 text-slate-50 px-3 text-xs font-medium rounded-md h-8 border-gray-700 cursor-pointer"
            onClick={() => document.getElementById("feedback-image-upload").click()}
          >
            {uploadingImages ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading...</> : <><Upload className="w-4 h-4 mr-1" />Images</>}
          </Button>

          <input id="feedback-file-upload" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={handleFileUpload} className="hidden" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingFile}
            className="bg-amber-500 px-3 text-xs font-medium rounded-md h-8 border-gray-700 cursor-pointer"
            onClick={() => document.getElementById("feedback-file-upload").click()}
          >
            {uploadingFile ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading...</> : <><Paperclip className="w-4 h-4 mr-1" />File</>}
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white ml-auto"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}