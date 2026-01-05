import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Mail, Edit2, Save, RotateCcw, Loader2, Info, Send } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_TEMPLATES = [
  {
    template_key: "needs_review",
    template_name: "Single Item Review",
    subject_template: "Achtung Kraft // REVIEW NEEDED: {request_title}",
    body_intro: "You have a new item that requires your review:",
    item_format: "",
    button_text: "VIEW & APPROVE REQUEST",
    closing_text: "— Achtung Kraft Projects",
  },
  {
    template_key: "bulk_review",
    template_name: "Bulk Review (Multiple Items)",
    subject_template: "Achtung Kraft // {item_count} ITEMS NEED YOUR REVIEW: {project_name}",
    body_intro: "You have {item_count} item(s) that need your review:",
    item_format: "{request_title} ({request_type})",
    button_text: "VIEW ALL ITEMS",
    closing_text: "— Achtung Kraft Projects",
  },
  {
    template_key: "journal_entry",
    template_name: "Journal Entry Update",
    subject_template: "Achtung Kraft // New Update: {headline}",
    body_intro: "There's a new update on your project:",
    item_format: "",
    button_text: "VIEW FULL UPDATE",
    closing_text: "— Achtung Kraft Projects",
  },
  {
    template_key: "status_update",
    template_name: "Request Status Change",
    subject_template: "Achtung Kraft // Request Update: {request_title}",
    body_intro: "The request has been updated.",
    item_format: "",
    button_text: "VIEW REQUEST",
    closing_text: "— Achtung Kraft Projects",
  },
  {
    template_key: "welcome",
    template_name: "Welcome Email",
    subject_template: "Achtung Kraft // Welcome to {project_name} Project Portal",
    body_intro: "Welcome! You've been given access to the project portal.",
    item_format: "",
    button_text: "ACCESS YOUR PORTAL",
    closing_text: "— Achtung Kraft Projects",
  },
];

const PLACEHOLDER_INFO = {
  needs_review: ["{project_name}", "{request_title}", "{request_body}", "{client_name}", "{client_slug}"],
  bulk_review: ["{project_name}", "{item_count}", "{client_name}", "{client_slug}"],
  journal_entry: ["{project_name}", "{headline}", "{content_preview}", "{client_name}", "{client_slug}"],
  status_update: ["{project_name}", "{request_title}", "{old_status}", "{new_status}", "{client_name}", "{client_slug}"],
  welcome: ["{project_name}", "{client_name}", "{client_slug}"],
};

export default function EmailTemplatesConfig() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  const [sendingTest, setSendingTest] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["emailTemplates"],
    queryFn: () => base44.entities.EmailTemplate.list(),
  });

  // Merge saved templates with defaults
  const mergedTemplates = DEFAULT_TEMPLATES.map((defaultTpl) => {
    const saved = templates.find((t) => t.template_key === defaultTpl.template_key);
    return saved ? { ...defaultTpl, ...saved } : { ...defaultTpl, isDefault: true };
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const existing = templates.find((t) => t.template_key === data.template_key);
      if (existing) {
        return base44.entities.EmailTemplate.update(existing.id, data);
      } else {
        return base44.entities.EmailTemplate.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
      setEditingTemplate(null);
      toast.success("Template saved");
    },
    onError: () => toast.error("Failed to save template"),
  });

  const resetMutation = useMutation({
    mutationFn: async (templateKey) => {
      const existing = templates.find((t) => t.template_key === templateKey);
      if (existing) {
        return base44.entities.EmailTemplate.delete(existing.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
      toast.success("Template reset to default");
    },
    onError: () => toast.error("Failed to reset template"),
  });

  const handleEdit = (template) => {
    setFormData({ ...template });
    setEditingTemplate(template.template_key);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleReset = (templateKey) => {
    if (confirm("Reset this template to defaults?")) {
      resetMutation.mutate(templateKey);
    }
  };

  const handleSendTest = async (template) => {
    setSendingTest(template.template_key);
    try {
      const response = await base44.functions.invoke('sendTestEmail', {
        templateKey: template.template_key,
        to: 'sales@achtungkraft.com'
      });
      if (response.data?.success) {
        toast.success('Test email sent to sales@achtungkraft.com');
      } else {
        toast.error(response.data?.error || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      toast.error('Failed to send test email');
    } finally {
      setSendingTest(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-red-500" />
            Email Templates
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Customize the subject lines and body content for each email type
          </p>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-3">
        {mergedTemplates.map((template) => (
          <AccordionItem
            key={template.template_key}
            value={template.template_key}
            className="bg-black/40 border border-gray-700 rounded-lg overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-800/50">
              <div className="flex items-center gap-3 text-left">
                <Mail className="w-4 h-4 text-red-400" />
                <div>
                  <span className="text-white font-medium">{template.template_name}</span>
                  {template.isDefault && (
                    <Badge className="ml-2 bg-gray-700 text-gray-300 text-xs">Default</Badge>
                  )}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4">
                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs text-gray-400">Subject Line</Label>
                    <div className="bg-gray-800/50 rounded p-2 text-sm text-white mt-1">
                      {template.subject_template}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Body Intro</Label>
                    <div className="bg-gray-800/50 rounded p-2 text-sm text-white mt-1">
                      {template.body_intro}
                    </div>
                  </div>
                  {template.item_format && (
                    <div>
                      <Label className="text-xs text-gray-400">Item Format</Label>
                      <div className="bg-gray-800/50 rounded p-2 text-sm text-white mt-1">
                        {template.item_format}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-gray-400">Button Text</Label>
                    <div className="bg-gray-800/50 rounded p-2 text-sm text-white mt-1">
                      {template.button_text}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Closing</Label>
                    <div className="bg-gray-800/50 rounded p-2 text-sm text-white mt-1">
                      {template.closing_text}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => handleEdit(template)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSendTest(template)}
                    disabled={sendingTest === template.template_key}
                    className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                  >
                    {sendingTest === template.template_key ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-1" />
                    )}
                    Send Test
                  </Button>
                  {!template.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReset(template.template_key)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-800"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Reset to Default
                    </Button>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Available Placeholders */}
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
                <Info className="w-4 h-4" />
                Available Placeholders
              </div>
              <div className="flex flex-wrap gap-2">
                {PLACEHOLDER_INFO[editingTemplate]?.map((ph) => (
                  <code
                    key={ph}
                    className="bg-gray-800 px-2 py-1 rounded text-xs text-gray-300"
                  >
                    {ph}
                  </code>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-gray-300">Subject Line</Label>
              <Input
                value={formData.subject_template || ""}
                onChange={(e) =>
                  setFormData({ ...formData, subject_template: e.target.value })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
                placeholder="Email subject with {placeholders}"
              />
            </div>

            <div>
              <Label className="text-gray-300">Body Intro</Label>
              <Textarea
                value={formData.body_intro || ""}
                onChange={(e) =>
                  setFormData({ ...formData, body_intro: e.target.value })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1 min-h-[80px]"
                placeholder="Opening paragraph of the email"
              />
            </div>

            {(editingTemplate === "bulk_review") && (
              <div>
                <Label className="text-gray-300">Item Format (for lists)</Label>
                <Input
                  value={formData.item_format || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, item_format: e.target.value })
                  }
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  placeholder="Format for each list item"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available: {"{request_title}"}, {"{request_type}"}
                </p>
              </div>
            )}

            <div>
              <Label className="text-gray-300">Button Text</Label>
              <Input
                value={formData.button_text || ""}
                onChange={(e) =>
                  setFormData({ ...formData, button_text: e.target.value })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
                placeholder="Call to action button text"
              />
            </div>

            <div>
              <Label className="text-gray-300">Closing Text</Label>
              <Input
                value={formData.closing_text || ""}
                onChange={(e) =>
                  setFormData({ ...formData, closing_text: e.target.value })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
                placeholder="Email signature/closing"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingTemplate(null)}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}