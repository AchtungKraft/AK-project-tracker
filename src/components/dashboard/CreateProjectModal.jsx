import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, AlertTriangle, Eye } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { referenceDataConfig } from "@/components/common/queryConfig";

// Separator used between number prefix and description — matches dominant convention
const NAME_SEPARATOR = " - ";

/**
 * Parse a structured project number prefix from a project name.
 * Patterns: "24_9078_01 …", "24_9078 …", "21_9026_10 - …"
 * Returns { base, suffix, rest } or null if not a structured name.
 */
function parseProjectNumber(name) {
  if (!name) return null;
  const m = name.match(/^(\d{2}_\d{4,5})(?:_(\d{2,3}))?(.*)$/);
  if (!m) return null;
  return {
    base: m[1],
    suffix: m[2] || null,
    rest: (m[3] || "").replace(/^[\s_//-]+/, "").trim(),
  };
}

/**
 * Find the next available suffix for a base project number.
 */
function findNextSuffix(base, allProjects) {
  let maxSuffix = 0;
  for (const p of allProjects) {
    const parsed = parseProjectNumber(p.name);
    if (parsed && parsed.base === base) {
      const s = parsed.suffix ? parseInt(parsed.suffix, 10) : 0;
      if (s > maxSuffix) maxSuffix = s;
    }
  }
  return String(maxSuffix + 1).padStart(2, "0");
}

/**
 * Build the suggested project number (without description).
 */
function buildSuggestedNumber(sourceProject, allProjects) {
  if (!sourceProject?.name) return "";
  const parsed = parseProjectNumber(sourceProject.name);
  if (!parsed) return "";
  return `${parsed.base}_${findNextSuffix(parsed.base, allProjects)}`;
}

/**
 * Compose a final project name from number + description.
 */
function composeFinalName(projectNumber, description) {
  const num = projectNumber.trim();
  const desc = description.trim();
  if (!num && !desc) return "";
  if (!num) return desc;
  if (!desc) return num;
  return `${num}${NAME_SEPARATOR}${desc}`;
}

/**
 * Check if a project name already exists.
 */
function isDuplicateName(name, allProjects) {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  return allProjects.some(p => p.name?.trim().toLowerCase() === lower);
}

export default function CreateProjectModal({ onClose, sourceProject = null }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const { data: allProjects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  // Source parsing
  const sourceParsed = sourceProject ? parseProjectNumber(sourceProject.name) : null;
  const isStructuredSource = !!sourceParsed;

  // Separate project number and description fields
  const [projectNumber, setProjectNumber] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [copyProjectType, setCopyProjectType] = useState(true);

  // Non-name fields
  const [projectData, setProjectData] = useState(() => {
    if (!sourceProject) {
      return {
        client_name: "", client_email: "", client_phone: "",
        vin: "", project_type_id: "", status_id: "",
        start_date: "", target_completion: "", assigned_team: [],
      };
    }
    return {
      client_name: sourceProject.client_name || "",
      client_email: sourceProject.client_email || "",
      client_phone: sourceProject.client_phone || "",
      vin: "",
      project_type_id: sourceProject.project_type_id || "",
      status_id: "",
      start_date: "",
      target_completion: "",
      assigned_team: [],
    };
  });

  // Set initial number when allProjects loads
  useEffect(() => {
    if (sourceProject && allProjects.length > 0 && isStructuredSource) {
      setProjectNumber(prev => {
        if (!prev) return buildSuggestedNumber(sourceProject, allProjects);
        return prev;
      });
    }
  }, [sourceProject, allProjects, isStructuredSource]);

  // Composed final name for preview + validation
  const finalName = useMemo(() => {
    if (isStructuredSource || projectNumber.trim()) {
      return composeFinalName(projectNumber, projectDescription);
    }
    // Freeform: use description as full name
    return projectDescription.trim();
  }, [projectNumber, projectDescription, isStructuredSource]);

  // Duplicate check on the final composed name
  const duplicateWarning = useMemo(() => {
    if (!finalName) return null;
    return isDuplicateName(finalName, allProjects) ? "A project with this name already exists." : null;
  }, [finalName, allProjects]);

  // Missing description warning
  const missingDescription = isStructuredSource && projectNumber.trim() && !projectDescription.trim();

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['referenceData', 'projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
    ...referenceDataConfig,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['referenceData', 'statuses'],
    queryFn: () => base44.entities.StatusList.list(),
    ...referenceDataConfig,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['referenceData', 'teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
    ...referenceDataConfig,
  });

  const projectStatuses = statuses.filter(s => s.scope === 'Project' && s.active);
  const activeTypes = projectTypes.filter(t => t.active);
  const activeTeamMembers = teamMembers.filter(tm => tm.active);
  const sourceTypeName = activeTypes.find(t => t.id === sourceProject?.project_type_id)?.name;

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const freshProjects = await base44.entities.Project.list();
      if (isDuplicateName(data.name, freshProjects)) {
        const parsed = parseProjectNumber(data.name);
        if (parsed) {
          const nextSuffix = findNextSuffix(parsed.base, freshProjects);
          const newNumber = `${parsed.base}_${nextSuffix}`;
          const newName = composeFinalName(newNumber, projectDescription);
          toast({
            title: "Number was taken — updated",
            description: `Using "${newNumber}" instead.`,
          });
          data = { ...data, name: newName };
        } else {
          throw new Error(`A project named "${data.name}" already exists.`);
        }
      }
      return base44.entities.Project.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: "Project created successfully" });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Failed to create project", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!finalName.trim()) return;
    if (duplicateWarning) {
      toast({ title: "Duplicate name", description: duplicateWarning, variant: "destructive" });
      return;
    }
    if (missingDescription) {
      toast({ title: "Description required", description: "Enter a project or vehicle description.", variant: "destructive" });
      return;
    }

    const submitData = {
      ...projectData,
      name: finalName,
      financial_model_version: 'forward',
    };

    // If user unchecked "Copy Project Type", clear it
    if (sourceProject && !copyProjectType) {
      submitData.project_type_id = "";
    }

    createMutation.mutate(submitData);
  };

  const toggleTeamMember = (memberId) => {
    const currentTeam = projectData.assigned_team || [];
    if (currentTeam.includes(memberId)) {
      setProjectData({ ...projectData, assigned_team: currentTeam.filter(id => id !== memberId) });
    } else {
      setProjectData({ ...projectData, assigned_team: [...currentTeam, memberId] });
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Source badge + copy scope */}
      {sourceProject && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/30 border border-blue-800/40 text-sm">
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-gray-300">
              Source: <span className="text-white font-medium">{sourceProject.name}</span>
            </span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">Copied from source</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-300">
              {sourceProject.client_name && <span>Client: {sourceProject.client_name}</span>}
              {sourceProject.client_email && <span>Email: {sourceProject.client_email}</span>}
              {sourceProject.client_phone && <span>Phone: {sourceProject.client_phone}</span>}
              {sourceTypeName && copyProjectType && <span>Type: {sourceTypeName}</span>}
              {!sourceProject.client_name && !sourceProject.client_email && !sourceProject.client_phone && (
                <span className="text-gray-500">No client details on source</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project Number + Description (structured source) */}
      {isStructuredSource ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Project Number</Label>
              <Input
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                placeholder={`e.g., ${sourceParsed.base}_01`}
                className="bg-gray-800 border-gray-700 text-white font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Base: {sourceParsed.base} · Next suffix auto-calculated
              </p>
            </div>
            <div>
              <Label>
                Project Description <span className="text-red-400">*</span>
              </Label>
              <Input
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Enter new project or vehicle description"
                className="bg-gray-800 border-gray-700 text-white"
                required
              />
              {missingDescription && (
                <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  A description is required for new projects
                </p>
              )}
            </div>
          </div>

          {/* Live final name preview */}
          {(projectNumber.trim() || projectDescription.trim()) && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/40">
              <Eye className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Final Project Name</p>
                <p className="text-sm text-white font-medium truncate">
                  {finalName || <span className="text-gray-500 italic">Enter number and description</span>}
                </p>
              </div>
            </div>
          )}

          {duplicateWarning && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {duplicateWarning}
            </p>
          )}
        </div>
      ) : (
        /* Freeform / Blank — single name field */
        <div>
          <Label>Project Name</Label>
          <Input
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="e.g., 1973 911 RSR Tribute"
            className="bg-gray-800 border-gray-700 text-white"
            required
          />
          {duplicateWarning && (
            <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {duplicateWarning}
            </p>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${isStructuredSource ? '' : 'md:grid-cols-2'} gap-4`}>
        {!isStructuredSource && (
          <div>
            <Label>VIN / Chassis Number</Label>
            <Input
              value={projectData.vin}
              onChange={(e) => setProjectData({ ...projectData, vin: e.target.value })}
              placeholder="VIN or chassis number"
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
        )}
        {isStructuredSource && (
          <div>
            <Label>VIN / Chassis Number</Label>
            <Input
              value={projectData.vin}
              onChange={(e) => setProjectData({ ...projectData, vin: e.target.value })}
              placeholder="VIN or chassis number"
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Client Name</Label>
          <Input
            value={projectData.client_name}
            onChange={(e) => setProjectData({ ...projectData, client_name: e.target.value })}
            placeholder="Client name"
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>
        <div>
          <Label>Client Email</Label>
          <Input
            type="email"
            value={projectData.client_email}
            onChange={(e) => setProjectData({ ...projectData, client_email: e.target.value })}
            placeholder="client@example.com"
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>
        <div>
          <Label>Client Phone</Label>
          <Input
            value={projectData.client_phone}
            onChange={(e) => setProjectData({ ...projectData, client_phone: e.target.value })}
            placeholder="Phone number"
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Project Type</Label>
            {sourceProject && sourceTypeName && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={copyProjectType}
                  onCheckedChange={(v) => {
                    setCopyProjectType(!!v);
                    if (!v) {
                      setProjectData({ ...projectData, project_type_id: "" });
                    } else {
                      setProjectData({ ...projectData, project_type_id: sourceProject.project_type_id || "" });
                    }
                  }}
                />
                <span className="text-[11px] text-gray-400">Copy from source</span>
              </label>
            )}
          </div>
          <Select
            value={projectData.project_type_id}
            onValueChange={(value) => setProjectData({ ...projectData, project_type_id: value })}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select project type" />
            </SelectTrigger>
            <SelectContent>
              {activeTypes.map(type => (
                <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={projectData.status_id}
            onValueChange={(value) => setProjectData({ ...projectData, status_id: value })}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {projectStatuses.map(status => (
                <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Start Date</Label>
          <Input
            type="date"
            value={projectData.start_date}
            onChange={(e) => setProjectData({ ...projectData, start_date: e.target.value })}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>
        <div>
          <Label>Target Completion</Label>
          <Input
            type="date"
            value={projectData.target_completion}
            onChange={(e) => setProjectData({ ...projectData, target_completion: e.target.value })}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>
      </div>

      <div>
        <Label>Assigned Team Members</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
          {activeTeamMembers.map(member => (
            <label
              key={member.id}
              className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={(projectData.assigned_team || []).includes(member.id)}
                onChange={() => toggleTeamMember(member.id)}
                className="rounded"
              />
              <span className="text-sm text-white">{member.full_name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Helper text for source mode */}
      {sourceProject && (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Copies the available client contact and project-type fields from the selected project. Tasks, phases, files, financial records, and work history are not copied.
        </p>
      )}

      {!isMobile && (
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-red-600 hover:bg-red-700"
            disabled={createMutation.isPending || !!duplicateWarning || !finalName.trim() || missingDescription}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Project'
            )}
          </Button>
        </div>
      )}
    </form>
  );

  const mobileFooter = (
    <MobilePrimaryActionStack
      primaryAction={{
        label: createMutation.isPending ? 'Creating...' : 'Create Project',
        onClick: handleSubmit,
        disabled: createMutation.isPending || !!duplicateWarning || !finalName.trim() || missingDescription,
        loading: createMutation.isPending,
      }}
      secondaryActions={[
        { label: 'Cancel', onClick: onClose, variant: 'outline' }
      ]}
    />
  );

  if (isMobile) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30 text-white">
          <MobileModalWrapper
            title="Create New Project"
            onClose={onClose}
            footer={mobileFooter}
          >
            {formContent}
          </MobileModalWrapper>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create New Project</DialogTitle>
          <DialogDescription>
            Enter the details to create a new project.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}