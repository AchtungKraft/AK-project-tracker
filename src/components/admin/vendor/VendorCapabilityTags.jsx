import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

const SUGGESTED_TAGS = [
  "Chrome", "Nickel", "Zinc", "Pot Metal", "Aluminum", "Stainless",
  "Magnesium", "Polishing", "Machining", "Restoration", "Fabrication",
  "Anodizing", "Cerakote", "Powder Coat", "Paint", "Upholstery",
  "Cad Plating", "Copper", "Brass", "Glass", "Leather", "Welding",
  "Media Blasting", "Sandblasting", "Ceramic Coating",
];

export function VendorCapabilityTagsDisplay({ tags }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(tag => (
        <Badge key={tag} variant="outline" className="text-[10px] border-cyan-600/40 text-cyan-400 bg-cyan-900/10">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

export function VendorCapabilityTagsEditor({ tags = [], onChange }) {
  const [input, setInput] = useState("");

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput("");
  };

  const removeTag = (tag) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(input);
    }
  };

  const unusedSuggestions = SUGGESTED_TAGS.filter(t => !tags.includes(t));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map(tag => (
          <Badge key={tag} variant="outline" className="text-[10px] border-cyan-600/40 text-cyan-400 bg-cyan-900/10 gap-1 pr-1">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-white">
              <X className="w-2.5 h-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add tag..."
          className="bg-gray-800 border-gray-600 text-white h-7 text-xs flex-1"
        />
        <button
          type="button"
          onClick={() => addTag(input)}
          disabled={!input.trim()}
          className="text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 px-1"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unusedSuggestions.slice(0, 12).map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-500 hover:text-cyan-400 hover:border-cyan-600/40 transition-colors"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}