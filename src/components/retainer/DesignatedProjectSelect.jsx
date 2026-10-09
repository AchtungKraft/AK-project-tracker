import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DesignatedProjectSelect({ value, onChange, projects, disabled }) {
  return (
    <div className="space-y-1">
      <Label className="text-gray-300">Designated D&amp;D project (optional)</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}>
        <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-gray-500">Only projects already linked to this client account are listed.</p>
    </div>
  );
}