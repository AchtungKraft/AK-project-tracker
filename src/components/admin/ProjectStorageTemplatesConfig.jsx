import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, RotateCcw, Trash2, GripVertical, Edit2, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { getLocationTypeConfig, getLocationTypeOptions } from "../inventory/locationTypeConfig";

const STORAGE_KEY = 'ak_project_storage_templates';

const DEFAULT_TEMPLATES = [
  { key: "main_shelf",        label: "Main Shelf",        type: "project_shelf",   sortOrder: 0, enabled: true, description: "" },
  { key: "engine_cart",       label: "Engine Cart",       type: "engine_cart",      sortOrder: 1, enabled: true, description: "" },
  { key: "body_cart",         label: "Body Cart",         type: "body_cart",        sortOrder: 2, enabled: true, description: "" },
  { key: "interior",          label: "Interior",          type: "project_storage",  sortOrder: 3, enabled: true, description: "" },
  { key: "hardware",          label: "Hardware",          type: "bin",              sortOrder: 4, enabled: true, description: "" },
  { key: "removed_parts",     label: "Removed Parts",     type: "project_storage",  sortOrder: 5, enabled: true, description: "" },
  { key: "customer_supplied", label: "Customer Supplied", type: "project_storage",  sortOrder: 6, enabled: true, description: "" },
  { key: "ready_to_install",  label: "Ready to Install",  type: "staging",          sortOrder: 7, enabled: true, description: "" },
  { key: "inspection",        label: "Inspection",        type: "inspection",       sortOrder: 8, enabled: true, description: "" },
  { key: "shipping",          label: "Shipping",          type: "shipping",         sortOrder: 9, enabled: true, description: "" },
];

function loadTemplates() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return DEFAULT_TEMPLATES;
}

function saveTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

/** Get active templates for project initialization */
export function getActiveProjectStorageTemplates() {
  return loadTemplates().filter(t => t.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

export default function ProjectStorageTemplatesConfig() {
  const [templates, setTemplates] = useState(loadTemplates);
  const [editingKey, setEditingKey] = useState(null);
  const [addMode, setAddMode] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ key: "", label: "", type: "project_storage", description: "", shortCodePattern: "" });

  useEffect(() => { saveTemplates(templates); }, [templates]);

  const handleToggle = (key) => {
    setTemplates(prev => prev.map(t => t.key === key ? { ...t, enabled: !t.enabled } : t));
  };

  const handleUpdateField = (key, field, value) => {
    setTemplates(prev => prev.map(t => t.key === key ? { ...t, [field]: value } : t));
  };

  const handleAdd = () => {
    const k = newTemplate.key.trim().replace(/\s+/g, '_').toLowerCase();
    if (!k || !newTemplate.label.trim()) {
      toast.error('Key and label are required');
      return;
    }
    if (templates.some(t => t.key === k)) {
      toast.error('Template key already exists');
      return;
    }
    setTemplates(prev => [...prev, {
      key: k,
      label: newTemplate.label.trim(),
      type: newTemplate.type,
      sortOrder: prev.length,
      enabled: true,
      description: newTemplate.description,
      shortCodePattern: newTemplate.shortCodePattern,
      custom: true,
    }]);
    setNewTemplate({ key: "", label: "", type: "project_storage", description: "", shortCodePattern: "" });
    setAddMode(false);
    toast.success('Template added');
  };

  const handleRemove = (key) => {
    const t = templates.find(x => x.key === key);
    if (!t?.custom) {
      toast.error('Default templates cannot be removed — disable instead');
      return;
    }
    setTemplates(prev => prev.filter(x => x.key !== key));
    toast.success('Template removed');
  };

  const handleResetDefaults = () => {
    setTemplates(DEFAULT_TEMPLATES);
    toast.success('Templates reset to defaults');
  };

  const typeOptions = getLocationTypeOptions();

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white text-base">Project Storage Templates</CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              Configure default storage locations created when initializing project storage.
              Changes apply to future initializations only.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleResetDefaults} className="border-gray-700 text-gray-400 gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {templates.sort((a, b) => a.sortOrder - b.sortOrder).map((t) => {
          const tc = getLocationTypeConfig(t.type);
          const Icon = tc.icon;
          const isEditing = editingKey === t.key;

          return (
            <div
              key={t.key}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                t.enabled ? 'border-gray-700 bg-gray-900/40' : 'border-gray-800 bg-gray-900/20 opacity-60'
              }`}
            >
              <GripVertical className="w-4 h-4 text-gray-600 shrink-0" />
              <Switch checked={t.enabled} onCheckedChange={() => handleToggle(t.key)} />
              <Icon className="w-4 h-4 shrink-0" style={{ color: tc.color }} />

              {isEditing ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={t.label}
                    onChange={(e) => handleUpdateField(t.key, 'label', e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white h-8 text-sm w-40"
                  />
                  <Select value={t.type} onValueChange={(v) => handleUpdateField(t.key, 'type', v)}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map(o => (
                        <SelectItem key={o.value} value={o.value}>
                          <span style={{ color: o.color }}>{o.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={t.sortOrder}
                    type="number"
                    onChange={(e) => handleUpdateField(t.key, 'sortOrder', parseInt(e.target.value) || 0)}
                    className="bg-gray-800 border-gray-700 text-white h-8 w-16"
                  />
                  <Button size="icon" variant="ghost" onClick={() => setEditingKey(null)} className="h-7 w-7 text-green-400">
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">{t.label}</span>
                    <span className="text-[10px] font-mono text-gray-600">{t.key}</span>
                    {t.custom && <Badge variant="outline" className="text-[10px] border-purple-700 text-purple-400">Custom</Badge>}
                  </div>
                  {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                </div>
              )}

              <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: tc.color + '60', color: tc.color }}>
                {tc.label}
              </Badge>

              <div className="flex items-center gap-1 shrink-0">
                {!isEditing && (
                  <Button size="icon" variant="ghost" onClick={() => setEditingKey(t.key)} className="h-7 w-7 text-blue-400">
                    <Edit2 className="w-3 h-3" />
                  </Button>
                )}
                {t.custom && (
                  <Button size="icon" variant="ghost" onClick={() => handleRemove(t.key)} className="h-7 w-7 text-red-400">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add custom template */}
        {addMode ? (
          <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Template Key *</Label>
                <Input
                  value={newTemplate.key}
                  onChange={(e) => setNewTemplate(p => ({ ...p, key: e.target.value }))}
                  placeholder="e.g., trim_parts"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Label *</Label>
                <Input
                  value={newTemplate.label}
                  onChange={(e) => setNewTemplate(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g., Trim Parts"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Location Type</Label>
                <Select value={newTemplate.type} onValueChange={(v) => setNewTemplate(p => ({ ...p, type: v }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <span style={{ color: o.color }}>{o.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Description</Label>
                <Input
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} className="bg-red-600 hover:bg-red-700 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Template
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddMode(false)} className="border-gray-700 text-gray-400">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddMode(true)} className="border-gray-700 text-gray-400 gap-1.5 w-full">
            <Plus className="w-3.5 h-3.5" />
            Add Custom Template
          </Button>
        )}
      </CardContent>
    </Card>
  );
}