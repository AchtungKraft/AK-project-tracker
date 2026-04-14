import React, { useState, useRef } from "react";
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
import useFileUploader from "./useFileUploader";
import FileUploadStatusList from "./FileUploadStatusList";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const imageUploader = useFileUploader();
  const fileUploader = useFileUploader();

  const handleImageUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    imageUploader.addFiles(files);
    e.target.value = "";
  };

  const handleFileUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    fileUploader.addFiles(files);
    e.target.value = "";
  };

  const resetForm = () => {
    setContentHtml("");
    setLinks([]);
    imageUploader.clearAll();
    fileUploader.clearAll();
    setExpanded(false);
    isSubmittingRef.current = false;
  };

  const handleSubmit = async () => {
    // Prevent double-submit
    if (isSubmittingRef.current || isSubmitting) return;

    const plainText = contentHtml?.replace(/<[^>]*>/g, "").trim() || "";
    const hasContent = plainText.length > 0;
    const hasLinks = links.some(l => l.url?.trim());
    const hasMedia = imageUploader.uploadedUrls.length > 0 || fileUploader.uploadedFileObjects.length > 0;

    if (!hasContent && !hasLinks && !hasMedia) {
      toast.error("Please enter a comment, add a link, or attach a file");
      return;
    }

    // Block submit if uploads are still in flight
    if (imageUploader.isUploading || fileUploader.isUploading) {
      toast.error("Please wait for uploads to finish");
      return;
    }

    // Warn about failed uploads but allow submit with successful ones
    if (imageUploader.failedCount > 0 || fileUploader.failedCount > 0) {
      const totalFailed = imageUploader.failedCount + fileUploader.failedCount;
      toast.warning(`${totalFailed} file${totalFailed > 1 ? 's' : ''} failed to upload. Comment will be sent with successful uploads only.`);
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const sanitizedHtml = hasContent ? sanitizeJournalHtml(contentHtml) : null;
      const response = await base44.functions.invoke("addInternalComment", {
        requestId,
        content_html: sanitizedHtml,
        content_fallback: plainText,
        links: links.filter(l => l.url?.trim()),
        photos: imageUploader.uploadedUrls,
        files: fileUploader.uploadedFileObjects,
        visibility,
      });

      if (response.data?.success) {
        resetForm();
        toast.success("Comment added");
        onCommentAdded?.();
      } else {
        const errData = response.data?.error;
        if (errData?.type === 'RATE_LIMIT') {
          toast.error("Temporary issue. Please retry in a moment.");
        } else {
          toast.error(errData?.message || "Failed to add comment");
        }
      }
    } catch (error) {
      console.error("Add comment error:", error);
      const respErr = error?.response?.data?.error;
      if (respErr?.type === 'RATE_LIMIT') {
        toast.error("Temporary issue. Please retry in a moment.");
      } else {
        toast.error("Failed to add comment");
      }
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
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

        {/* Uploaded Images Status */}
        {imageUploader.files.length > 0 && (
          <div>
            <Label className="text-xs text-gray-400 mb-2 block">
              Images ({imageUploader.uploadedUrls.length}/{imageUploader.files.length})
            </Label>
            <FileUploadStatusList
              files={imageUploader.files}
              onRemove={imageUploader.removeFile}
              onRetry={imageUploader.retryFailed}
              mode="image"
            />
          </div>
        )}

        {/* Uploaded Files Status */}
        {fileUploader.files.length > 0 && (
          <div>
            <Label className="text-xs text-gray-400 mb-2 block">
              Files ({fileUploader.uploadedFileObjects.length}/{fileUploader.files.length})
            </Label>
            <FileUploadStatusList
              files={fileUploader.files}
              onRemove={fileUploader.removeFile}
              onRetry={fileUploader.retryFailed}
              mode="file"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <input id="feedback-image-upload" type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={imageUploader.isUploading}
            className="bg-red-700 text-slate-50 px-3 text-xs font-medium rounded-md h-8 border-gray-700 cursor-pointer"
            onClick={() => document.getElementById("feedback-image-upload").click()}
          >
            {imageUploader.isUploading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading...</> : <><Upload className="w-4 h-4 mr-1" />Images</>}
          </Button>

          <input id="feedback-file-upload" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={handleFileUpload} className="hidden" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fileUploader.isUploading}
            className="bg-amber-500 px-3 text-xs font-medium rounded-md h-8 border-gray-700 cursor-pointer"
            onClick={() => document.getElementById("feedback-file-upload").click()}
          >
            {fileUploader.isUploading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading...</> : <><Paperclip className="w-4 h-4 mr-1" />File</>}
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || imageUploader.isUploading || fileUploader.isUploading}
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