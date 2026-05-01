import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

export default function CommentLinkInput({ onAdd, onCancel }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleAdd = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    
    // Auto-prepend https if missing
    const finalUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    
    onAdd({
      url: finalUrl,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
    setUrl("");
    setTitle("");
    setDescription("");
  };

  return (
    <div className="p-3 bg-gray-800/70 rounded-lg border border-gray-600 space-y-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL (e.g. https://example.com)"
        className="bg-gray-900 border-gray-700 text-white text-sm h-8"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="bg-gray-900 border-gray-700 text-white text-sm h-8"
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="bg-gray-900 border-gray-700 text-white text-sm h-8"
      />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs text-gray-400">
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleAdd} disabled={!url.trim()} className="h-7 text-xs bg-red-600 hover:bg-red-700">
          <Plus className="w-3 h-3 mr-1" />
          Add Link
        </Button>
      </div>
    </div>
  );
}