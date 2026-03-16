import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, GripVertical, ExternalLink, FileText, Video, Image, HardDrive, Truck, BookOpen } from "lucide-react";
import { generateLinkId } from "./journalSanitizer";

const LINK_TYPES = [
  { value: 'external', label: 'External', icon: ExternalLink },
  { value: 'document', label: 'Document', icon: FileText },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'drive', label: 'Drive', icon: HardDrive },
  { value: 'supplier', label: 'Supplier', icon: Truck },
  { value: 'reference', label: 'Reference', icon: BookOpen },
];

export function getLinkTypeIcon(type) {
  const found = LINK_TYPES.find(t => t.value === type);
  return found?.icon || ExternalLink;
}

export default function JournalLinksEditor({ links = [], onChange }) {
  const addLink = () => {
    onChange([...links, {
      id: generateLinkId(),
      name: '',
      description: '',
      url: '',
      type: 'external',
    }]);
  };

  const updateLink = (index, field, value) => {
    const updated = links.map((link, i) => 
      i === index ? { ...link, [field]: value } : link
    );
    onChange(updated);
  };

  const removeLink = (index) => {
    onChange(links.filter((_, i) => i !== index));
  };

  const moveLink = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= links.length) return;
    const updated = [...links];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-gray-400">Links ({links.length})</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLink}
          className="border-gray-700 gap-1"
        >
          <Plus className="w-3 h-3" />
          Add Link
        </Button>
      </div>

      {links.length === 0 && (
        <p className="text-sm text-gray-600 italic">No links added yet.</p>
      )}

      {links.map((link, index) => {
        const TypeIcon = getLinkTypeIcon(link.type);
        return (
          <div
            key={link.id || index}
            className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveLink(index, -1)}
                  disabled={index === 0}
                  className="text-gray-500 hover:text-gray-300 disabled:opacity-30 text-xs leading-none"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveLink(index, 1)}
                  disabled={index === links.length - 1}
                  className="text-gray-500 hover:text-gray-300 disabled:opacity-30 text-xs leading-none"
                >
                  ▼
                </button>
              </div>
              
              <TypeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  value={link.name}
                  onChange={(e) => updateLink(index, 'name', e.target.value)}
                  placeholder="Link name"
                  className="bg-gray-900 border-gray-600 text-white text-sm h-8"
                />
                <Input
                  value={link.url}
                  onChange={(e) => updateLink(index, 'url', e.target.value)}
                  placeholder="https://..."
                  className="bg-gray-900 border-gray-600 text-white text-sm h-8 font-mono"
                />
              </div>
              
              <button
                type="button"
                onClick={() => removeLink(index)}
                className="text-red-400 hover:text-red-300 p-1 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-8">
              <Input
                value={link.description}
                onChange={(e) => updateLink(index, 'description', e.target.value)}
                placeholder="Description (optional)"
                className="bg-gray-900 border-gray-600 text-white text-sm h-8"
              />
              <Select
                value={link.type}
                onValueChange={(val) => updateLink(index, 'type', val)}
              >
                <SelectTrigger className="bg-gray-900 border-gray-600 text-white h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <t.icon className="w-3 h-3" />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })}
    </div>
  );
}